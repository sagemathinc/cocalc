import express from "express";
import fs from "node:fs";
import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { once } from "node:events";
import getLogger from "@cocalc/backend/logger";
import { projectApiClient } from "@cocalc/conat/project/api/project-client";

const logger = getLogger("file-server:ssh:auth");

export const DEFAULT_PORT = 8443;

export async function init({
  port = DEFAULT_PORT,
  client,
}: {
  port?: number;
  client?: ConatClient;
}) {
  logger.debug("init: generating ssh key...");
  const seed = randomBytes(32);
  export const sshKey = ssh(seed, "server");
  logger.debug("init: public key", sshKey.publicKey);

  logger.debug("init: starting ssh server...");
  const app = express();
  app.use(express.json());

  app.get("/auth/:user", async (req, res) => {
    const { user } = req.params;
    try {
      const { user, host, publicKey } = await handleRequest(user, client);
      res.json({
        privateKey: sshKey.privateKey,
        user,
        host,
        authorizedKeys: publicKey,
      });
    } catch (err) {
      res.status(403).json({ error: `${err}` });
    }
  });

  const server = app.listen(8443);
  await once(server, "listening");
  const mesg = `sshpiper auth @ http://127.0.0.1:${port}/auth/:user`;
  console.log(mesg);
  logger.debug("init: ", mesg);
}

async function handleRequest(
  user: string,
  client: ConatClient,
): Promise<{ user: string; host: string; publicKey: string }> {
  if (user.startsWith("project-")) {
    const project_id = user.slice("project-".length, "project-".length + 36);
    const id = user.slice("project-".length + 37);
    const compute_server_id = parseInt(id ? id : "0");
    const api = projectApiClient({
      project_id,
      compute_server_id,
      client,
      timeout: 5000,
    });
    const publicKey = await api.system.sshPublicKey();

    return { user: "wstein", host: "localhost", publicKey };
  } else {
    throw Error("uknown user");
  }
}
