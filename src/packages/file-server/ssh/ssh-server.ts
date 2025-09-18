/*
Ssh server - manages how projects and their files are accessed via ssh.

This is a service that runs directly on the btrfs file server.  It:

- listens for incoming ssh connections from:
   - project
   - compute server
   - external users

- uses conat to determine what public keys grant access to a user
  of the above type

- if user is valid, it creates container (if necessary) and connects
  them to it via ssh.


./sshpiperd \
  -i server_host_key \
  --server-key-generate-mode notexist \
  ./sshpiperd-rest --url http://127.0.0.1:8443/auth


Security NOTE / TODO: It would be more secure to modify sshpiperd-rest
to support a UDP socket and use that instead, since we're running
the REST server on localhost.
*/

import { init as initAuth } from "./auth";
import { install, sshpiper } from "@cocalc/backend/sandbox/install";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { secrets, sshServer } from "@cocalc/backend/data";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:ssh:ssh-server");

const children: any[] = [];
export async function init({
  port = sshServer.port,
  client,
}: {
  port?: number;
  client?: ConatClient;
} = {}) {
  logger.debug("init", { port });
  // ensure sshpiper and dropbear are installed
  await Promise.all([install("sshpiper"), install("dropbear")]);
  const { url } = await initAuth({ client });
  const hostKey = join(secrets, "sshpiperd", "host_key");
  await mkdir(dirname(hostKey), { recursive: true });
  const args = [
    "-i",
    hostKey,
    `--port=${port}`,
    "--server-key-generate-mode",
    "notexist",
    sshpiper + "-rest",
    "--url",
    url,
  ];
  logger.debug(`${sshpiper} ${args.join(" ")}`);
  const child = spawn(sshpiper, args);
  children.push(child);
  child.stdout.on("data", (chunk: Buffer) => {
    logger.debug(chunk.toString());
  });
  child.stderr.on("data", (chunk: Buffer) => {
    logger.debug(chunk.toString());
  });
  return child;
}

export function close() {
  for (const child of children) {
    if (child.exitCode == null) {
      child.kill("SIGKILL");
    }
  }
  children.length = 0;
}

// important because it kills all
// the processes that were spawned
process.once("exit", close);
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    process.exit();
  });
});
