import express from "express";
import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { once } from "node:events";
import getLogger from "@cocalc/backend/logger";
import { projectApiClient } from "@cocalc/conat/project/api/project-client";
import { conat } from "@cocalc/backend/conat";
import * as container from "./container";

const logger = getLogger("file-server:ssh:auth");

export const DEFAULT_PORT = 8443;

export async function init({
  port = DEFAULT_PORT,
  client,
}: {
  port?: number;
  client?: ConatClient;
} = {}) {
  logger.debug("init");
  client ??= conat();
  logger.debug("init: generating ssh key...");
  const seed = randomBytes(32);
  const sshKey = ssh(seed, "server");
  logger.debug("init: public key", sshKey.publicKey);

  logger.debug("init: starting ssh server...");
  const app = express();
  app.use(express.json());

  app.get("/auth/:user", async (req, res) => {
    try {
      console.log("got request", req.params);
      const { volume, publicKey } = await handleRequest(
        req.params.user,
        client,
      );

      // the project is actually running, so we ensure ssh target container
      // is available locally:
      const { sshPort } = await container.start({
        volume,
        publicKey: sshKey.publicKey,
        path: "/tmp/y",
      });

      const resp = {
        privateKey: sshKey.privateKey,
        user: "root",
        host: `localhost:${sshPort}`,
        authorizedKeys: publicKey,
      };

      console.log("sending", resp);

      res.json(resp);
    } catch (err) {
      res.status(403).json({ error: `${err}` });
    }
  });

  const server = app.listen(8443);
  await once(server, "listening");
  const mesg = `sshpiper auth @ http://127.0.0.1:${port}/auth/:user`;
  console.log(mesg);
  logger.debug("init: ", mesg);
  return { server, app };
}

async function handleRequest(
  user: string | undefined,
  client: ConatClient,
): Promise<{ publicKey: string; volume: string }> {
  if (user?.startsWith("project-")) {
    const project_id = user.slice("project-".length, "project-".length + 36);
    const volume = `project-${project_id}`;
    const id = user.slice("project-".length + 37);
    const compute_server_id = parseInt(id ? id : "0");
    const api = projectApiClient({
      project_id,
      compute_server_id,
      client,
      timeout: 5000,
    });
    const publicKey = await api.system.sshPublicKey();

    return { publicKey, volume };
  } else {
    throw Error("uknown user");
  }
}
