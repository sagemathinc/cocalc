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
import { startProxyServer, createProxyHandlers } from "./proxy";
import { install, sshpiper } from "@cocalc/backend/sandbox/install";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { secrets, sshServer } from "@cocalc/backend/data";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:ssh:ssh-server");

export function secretsPath() {
  return join(secrets, "sshpiperd");
}

const children: ChildProcessWithoutNullStreams[] = [];

function removeChild(child: ChildProcessWithoutNullStreams) {
  const i = children.indexOf(child);
  if (i !== -1) {
    children.splice(i, 1);
  }
}

const FAILURE_PATTERNS = [
  /FATA/i,
  /failed to listen/i,
  /bind: address already in use/i,
];

async function waitForStartup(
  child: ChildProcessWithoutNullStreams,
  port: number,
): Promise<void> {
  return await new Promise((resolve, reject) => {
    let done = false;
    let startupComplete = false;
    let stderrBuffer = "";
    let timer: NodeJS.Timeout;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
      if (err) {
        reject(err);
      } else {
        startupComplete = true;
        resolve();
      }
    };

    const onStdout = (chunk: Buffer) => {
      logger.debug(chunk.toString());
    };

    const onStderr = (chunk: Buffer) => {
      const text = chunk.toString();
      logger.debug(text);
      if (startupComplete) {
        return;
      }
      stderrBuffer += text;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        if (FAILURE_PATTERNS.some((pattern) => pattern.test(line))) {
          finish(
            new Error(
              `sshpiperd failed to start on port ${port}: ${line.trim()}`,
            ),
          );
          return;
        }
      }
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (startupComplete) {
        return;
      }
      const reason =
        code !== null
          ? `code ${code}`
          : signal
            ? `signal ${signal}`
            : "unknown";
      finish(
        new Error(
          `sshpiperd exited before it was ready (port ${port}, ${reason})`,
        ),
      );
    };

    const onError = (err: Error) => {
      if (startupComplete) {
        return;
      }
      finish(err);
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
    child.once("error", onError);

    timer = setTimeout(() => {
      finish();
    }, 5000);
  });
}

export async function init({
  port = sshServer.port,
  client,
  scratch,
  proxyHandlers,
  exitOnFail = true,
}: {
  port?: number;
  client?: ConatClient;
  scratch: string;
  proxyHandlers?: boolean;
  exitOnFail?: boolean;
}) {
  logger.debug("init", { port, proxyHandlers });
  // ensure sshpiper is installed
  await install("sshpiper");
  const projectProxyHandlers = proxyHandlers
    ? createProxyHandlers()
    : await startProxyServer();
  const { url } = await initAuth({ client, scratch });
  const hostKey = join(secretsPath(), "host_key");
  await mkdir(dirname(hostKey), { recursive: true });
  const args = [
    "-i",
    hostKey,
    `--port=${port}`,
    "--log-level=warn",
    "--server-key-generate-mode",
    "notexist",
    sshpiper + "-rest",
    "--url",
    url,
  ];
  logger.debug(`${sshpiper} ${args.join(" ")}`);
  const child = spawn(sshpiper, args);
  children.push(child);

  try {
    await waitForStartup(child, port);
    logger.debug("sshpiperd started", { port });
  } catch (err) {
    removeChild(child);
    if (child.exitCode == null && child.signalCode == null) {
      child.kill("SIGKILL");
    }
    const message =
      err instanceof Error ? err.message : "unknown failure starting sshpiperd";
    logger.error(message);
    if (exitOnFail) {
      console.error(message);
      console.error("Shutting down.");
      process.exit(1);
    }
    throw err instanceof Error ? err : new Error(message);
  }

  return { child, projectProxyHandlers };
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
