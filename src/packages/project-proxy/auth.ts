import express from "express";
import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { once } from "node:events";
import { projectApiClient } from "@cocalc/conat/project/api/project-client";
import { conat } from "@cocalc/backend/conat";
import * as container from "./container";
import { secureRandomString } from "@cocalc/backend/misc";
import getLogger from "@cocalc/backend/logger";
import {
  client as createFileClient,
  type Fileserver,
} from "@cocalc/conat/files/file-server";
import { client as projectRunnerClient } from "@cocalc/conat/project/runner/run";
import { secretsPath } from "./ssh-server";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  FILE_SERVER_NAME,
  INTERNAL_SSH_CONFIG,
} from "@cocalc/conat/project/runner/constants";
import { isValidUUID } from "@cocalc/util/misc";

const logger = getLogger("file-server:ssh:auth");

const SECRET_TOKEN_LENGTH = 32;

export async function init({
  base_url,
  port,
  client,
  scratch,
}: {
  // as an extra level of security, it is recommended to
  // make the base_url a secure random string.
  base_url?: string;
  port?: number;
  client?: ConatClient;
  scratch: string;
}) {
  logger.debug("init");

  container.init();

  base_url ??= encodeURIComponent(
    await secureRandomString(SECRET_TOKEN_LENGTH),
  );
  client ??= conat();
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

  logger.debug("init: starting ssh server...");
  const app = express();
  app.use(express.json());

  app.get(`/${base_url}/:user`, async (req, res) => {
    try {
      const { volume, authorizedKeys, path, target } = await handleRequest(
        req.params.user,
        client,
      );

      let ports;
      if (target == "file-server") {
        // the project is actually running, so we ensure ssh target container
        // is available locally.
        ports = await container.start({
          volume,
          scratch,
          publicKey: sshKey.publicKey,
          authorizedKeys,
          path,
        });
      } else if (target == "sshd") {
        // do NOT start if not already running, because this could be any random
        // request for access to the project and user must explicitly start project
        // first.  Alternatively, if container weren't running we could consider
        // starting the project somehow...  but that could take a long time.
        ports = await container.getPorts({ volume });
      } else {
        throw Error(`unknown target '${target}'`);
      }

      const port = ports[target];
      if (port == null) {
        throw Error(`BUG -- port for target ${target} must be defined`);
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
  return { server, app, url };
}

async function handleRequest(
  user: string | undefined,
  client: ConatClient,
): Promise<{
  authorizedKeys: string;
  volume: string;
  path: string;
  target: "file-server" | "sshd";
}> {
  if (!user) {
    throw Error("invalid user");
  }
  const { target, project_id, compute_server_id } = parseUser(user);
  const volume = `project-${project_id}`;

  // NOTE/TODO: we could have a special username that maps to a
  // specific path in a project, which would change this path here,
  // and require a different auth dance above.  This could be for safely
  // sharing folders instead of all files in a project.
  const path = await getHome(client, project_id);

  const authorizedKeys = await getAuthorizedKeys({
    target,
    client,
    project_id,
    compute_server_id,
    path,
  });

  return { authorizedKeys, volume, path, target };
}

let fsclient: Fileserver | null = null;
function getFsClient(client) {
  fsclient ??= createFileClient({ client });
  return fsclient;
}

async function getHome(client: ConatClient, project_id: string) {
  const c = getFsClient(client);
  const { path } = await c.mount({ project_id });
  return path;
}

async function getAuthorizedKeys({
  target,
  client,
  project_id,
  compute_server_id,
  path,
}: {
  target: "file-server" | "sshd";
  client: ConatClient;
  project_id: string;
  compute_server_id: number;
  path: string;
}): Promise<string> {
  if (target == "file-server") {
    if (!compute_server_id) {
      const runner = projectRunnerClient({
        client,
        project_id,
        timeout: 5000,
        waitForInterest: false,
      });
      const { publicKey } = await runner.status({ project_id });
      if (!publicKey) {
        throw Error("no public key available for project");
      }
      return publicKey;
    } else {
      const api = projectApiClient({
        project_id,
        compute_server_id,
        client,
        timeout: 5000,
      });
      return await api.system.sshPublicKey();
    }
  } else if (target == "sshd") {
    if (!compute_server_id) {
      // Combine keys provided by the host (master/account/project keys) with
      // any keys the user has placed in ~/.ssh/authorized_keys.
      const keys: string[] = [];
      const managed = join(path, INTERNAL_SSH_CONFIG, "authorized_keys");
      const userKeys = join(path, ".ssh", "authorized_keys");
      for (const candidate of [managed, userKeys]) {
        try {
          const content = (await readFile(candidate, "utf8")).trim();
          if (content) {
            keys.push(content);
          }
        } catch (err) {
          logger.debug("authorized_keys not found", {
            project_id,
            path: candidate,
            err: `${err}`,
          });
        }
      }
      return keys.join("\n");
    } else {
      throw Error("ssh directly to compute server not yet implemented");
    }
  } else {
    throw Error(`unknown target '${target}'`);
  }
}

/*
The patterns that we support here:

- project-{uuid} --> target = 'sshd', project_id={uuid}
- {uuid} --> target = 'sshd', project_id={uuid}
- {uuid with dashes removed} --> target='sshd', project_id={uuid with dashes put back}
- {any of 3 above}-{compute_server_id} --> target = 'sshd', project_id={uuid}, compute_server_id=compute_server_id, where it is the GLOBAL compute server id.

- {FILE_SERVER_NAME}-project-{project_id} --> target='file-server', project_id={project_id}

*/
function parseUser(user: string): {
  project_id: string;
  target: "sshd" | "file-server";
  compute_server_id: number;
} {
  let target, prefix;
  if (user?.startsWith("project-")) {
    target = "sshd";
    prefix = "project-";
  } else if (user?.startsWith(`${FILE_SERVER_NAME}-project-`)) {
    // right now we only support project volumes, but later we may
    // support volumes like:
    //      file-server-mydata.
    // which gives user access to a volume called "mydata"
    // This of course just involves adding a way to lookup who
    // has access to mydata which is just determined by a public key...?
    target = "file-server";
    prefix = `${FILE_SERVER_NAME}-project-`;
  } else if (isValidUUID(user)) {
    target = "sshd";
    prefix = "";
  } else if (
    user.length >= 32 &&
    isValidUUID(putBackDashes(user.split("-")[0]))
  ) {
    target = "sshd";
    prefix = "";
    const v = user.split("-");
    user = putBackDashes(v[0]);
    if (v[1]) {
      // compute server id
      user += "-" + v[1];
    }
  } else {
    throw Error(`unknown user ${user}`);
  }

  const project_id = user.slice(prefix.length, prefix.length + 36);
  const id = user.slice(prefix.length + 37);
  const compute_server_id = parseInt(id ? id : "0");
  return { target, project_id, compute_server_id };
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
