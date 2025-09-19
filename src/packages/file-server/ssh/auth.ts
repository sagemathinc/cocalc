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

const logger = getLogger("file-server:ssh:auth");

const SECRET_TOKEN_LENGTH = 32;

export async function init({
  base_url,
  port,
  client,
}: {
  // as an extra level of security, it is recommended to
  // make the base_url a secure random string.
  base_url?: string;
  port?: number;
  client?: ConatClient;
} = {}) {
  logger.debug("init");
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
      const { volume, authorizedKeys, path } = await handleRequest(
        req.params.user,
        client,
      );

      // the project is actually running, so we ensure ssh target container
      // is available locally:
      const { sshPort } = await container.start({
        volume,
        publicKey: sshKey.publicKey,
        authorizedKeys,
        path,
      });
      if (!sshPort) {
        throw Error(`failed to start -- ${volume}`);
      }

      const resp = {
        privateKey: sshKey.privateKey,
        user: "root",
        host: `localhost:${sshPort}`,
        authorizedKeys,
      };

      //console.log("USING", { ...resp, privateKey: "xxx" });

      res.json(resp);
    } catch (err) {
      logger.debug("ERROR", err);
      // Doing this crashes the ssh server, so instead we respond with '' values.
      // res.status(403).json({ error: `${err}` });
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
): Promise<{ authorizedKeys: string; volume: string; path: string }> {
  if (user?.startsWith("project-")) {
    const project_id = user.slice("project-".length, "project-".length + 36);
    const volume = `project-${project_id}`;
    const id = user.slice("project-".length + 37);
    const compute_server_id = parseInt(id ? id : "0");
    let authorizedKeys;
    if (!compute_server_id) {
      const runner = projectRunnerClient({
        client,
        project_id,
        timeout: 5000,
        waitForInterest: false,
      });
      const s = await runner.status({ project_id });
      authorizedKeys = s.publicKey;
      if (!authorizedKeys) {
        throw Error("no ssh key known");
      }
    } else {
      const api = projectApiClient({
        project_id,
        compute_server_id,
        client,
        timeout: 5000,
      });
      authorizedKeys = await api.system.sshPublicKey();
    }

    // NOTE/TODO: we could have a special username that maps to a
    // specific path in a project, which would change this path here,
    // and require a different auth dance above.  This could be for safely
    // sharing folders instead of all files in a project.
    const path = await getHome(client, project_id);

    return { authorizedKeys, volume, path };
  } else {
    throw Error("uknown user");
  }
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
