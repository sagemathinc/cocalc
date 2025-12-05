import express from "express";
import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { once } from "node:events";
import { secureRandomString } from "@cocalc/backend/misc";
import getLogger from "@cocalc/backend/logger";
import { secretsPath } from "./ssh-server";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { isValidUUID } from "@cocalc/util/misc";

const logger = getLogger("project-proxy:ssh:auth");

const SECRET_TOKEN_LENGTH = 32;

export type SshTarget =
  | { type: "project"; project_id: string }
  | { type: "host"; host_id: string };

export async function ensureProxyKey() {
  let sshKey;
  const privKeyPath = join(secretsPath(), "id_ed25519");
  const pubKeyPath = join(secretsPath(), "id_ed25519.pub");

  try {
    sshKey = {
      privateKey: await readFile(privKeyPath, "utf8"),
      publicKey: await readFile(pubKeyPath, "utf8"),
    };
    logger.debug(`init: loaded ssh key from ${secretsPath}...`);
  } catch {
    logger.debug("init: generating ssh key...");
    const seed = randomBytes(32);
    sshKey = ssh(seed, "server");
    // persist to disk so stable between runs, so we can restart server without having to restart all the pods.
    await writeFile(privKeyPath, sshKey.privateKey);
    await writeFile(pubKeyPath, sshKey.publicKey);
    logger.debug("init: public key", sshKey.publicKey);
  }

  return sshKey;
}

export async function init({
  getSshdPort,
  getAuthorizedKeys,
  base_url,
  port,
}: {
  getSshdPort: (target: SshTarget) => number | null;
  getAuthorizedKeys: (target: SshTarget) => Promise<string>;
  // as an extra level of security, it is recommended to
  // make the base_url a secure random string.
  base_url?: string;
  port?: number;
}) {
  logger.debug("init");

  base_url ??= encodeURIComponent(
    await secureRandomString(SECRET_TOKEN_LENGTH),
  );
  const sshKey = await ensureProxyKey();

  logger.debug("init: starting ssh server...");
  const app = express();
  app.use(express.json());

  app.get(`/${base_url}/:user`, async (req, res) => {
    try {
      const { authorizedKeys, port } = await handleRequest(
        req.params.user,
        getSshdPort,
        getAuthorizedKeys,
      );

      if (!port) {
        // project isn't running -- no port available
        res.json({ privateKey: "", user: "", host: "", authorizedKeys: "" });
        return;
      }

      const resp = {
        privateKey: sshKey.privateKey,
        user: "root",
        host: `localhost:${port}`,
        authorizedKeys,
      };

      logger.debug(req.params.user, "--->", { ...resp, privateKey: "xxx" });

      res.json(resp);
    } catch (err) {
      logger.warn("ssh auth lookup failed", { user: req.params.user, err });
      // Doing this crashes the ssh server, so instead we respond with '' values.
      // res.status(403).json({ error: `${err}` });
      // Alternatively, we would have to rewrite the sshpiper_rest plugin.
      res.json({ privateKey: "", user: "", host: "", authorizedKeys: "" });
    }
  });

  const server = app.listen(port);
  await once(server, "listening");
  port = server.address().port;
  const url = `http://127.0.0.1:${port}/${base_url}`;
  const mesg = `sshpiper auth @ http://127.0.0.1:${port}/[...secret...]/:user`;
  logger.debug("init: ", mesg);
  return { server, app, url, publicKey: sshKey.publicKey };
}

async function handleRequest(
  user: string | undefined,
  getSshdPort,
  getAuthorizedKeys,
): Promise<{
  authorizedKeys: string;
  target: SshTarget;
  port: number | null;
}> {
  if (!user) {
    throw Error("invalid user");
  }
  const target = parseUser(user);
  const port = getSshdPort(target);
  if (!port) {
    return { target, port, authorizedKeys: "" };
  }
  const authorizedKeys = await getAuthorizedKeys(target);
  return { authorizedKeys, target, port };
}

/*
The patterns that we support here:

- project-{uuid} --> project_id={uuid}
- {uuid} --> project_id={uuid}
- {uuid with dashes removed} --> project_id={uuid with dashes put back}
- project-host-{uuid} --> host_id={uuid}
*/
function parseUser(user: string): SshTarget {
  let prefix;
  if (user?.startsWith("project-host-")) {
    const host_id = user.slice("project-host-".length);
    if (!isValidUUID(host_id)) {
      throw Error(`unknown user ${user}`);
    }
    return { type: "host", host_id };
  }
  if (user?.startsWith("project-")) {
    prefix = "project-";
  } else if (isValidUUID(user)) {
    prefix = "";
  } else if (
    user.length >= 32 &&
    isValidUUID(putBackDashes(user.split("-")[0]))
  ) {
    prefix = "";
    const v = user.split("-");
    return { type: "project", project_id: putBackDashes(v[0]) };
  } else {
    throw Error(`unknown user ${user}`);
  }

  return { type: "project", project_id: user.slice(prefix.length, prefix.length + 36) };
}

// 00000000-1000-4000-8000-000000000000
export function putBackDashes(s: string) {
  if (s.length != 32) {
    throw Error("must have length 32");
  }
  return (
    s.slice(0, 8) +
    "-" +
    s.slice(8, 12) +
    "-" +
    s.slice(12, 16) +
    "-" +
    s.slice(16, 20) +
    "-" +
    s.slice(20)
  );
}
