import getPort from "@cocalc/backend/get-port";
import { type Client } from "@cocalc/conat/core/client";
import {
  init as createConatServer,
  type Options,
  type ConatServer,
} from "@cocalc/conat/core/server";
import getLogger from "@cocalc/backend/logger";
import { setConatClient } from "@cocalc/conat/client";
import { server as createPersistServer } from "@cocalc/backend/conat/persist";
import { syncFiles } from "@cocalc/conat/persist/context";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
export { wait } from "@cocalc/backend/conat/test/util";
export { delay } from "awaiting";
export { setDefaultTimeouts } from "@cocalc/conat/core/client";
export { once } from "@cocalc/util/async-utils";
import { spawn, ChildProcess } from "node:child_process";

const logger = getLogger("conat:test:setup");

export const path = "/conat";

export async function initConatServer(
  options: Partial<Options> = {},
): Promise<ConatServer> {
  logger.debug("init");
  if (!options?.port) {
    const port = await getPort();
    options = { ...options, port };
  }

  return createConatServer({
    logger: logger.debug,
    ...options,
  });
}

export let tempDir;
export let server: any = null;
export let persistServer: any = null;

export async function createServer(opts?) {
  const port = await getPort();
  server = await initConatServer({ port, path, ...opts });
  return server;
}

export async function restartServer() {
  const port = server.options.port;
  await server.close();
  await createServer({ port });
}

export async function restartPersistServer() {
  await persistServer.close();
  client = connect();
  persistServer = createPersistServer({ client });
}

// one pre-made client
export let client;
export async function before() {
  tempDir = await mkdtemp(join(tmpdir(), "conat-test"));
  server = await createServer();
  client = connect();
  persistServer = createPersistServer({ client });
  syncFiles.local = join(tempDir, "local");
  syncFiles.archive = join(tempDir, "archive");
  setConatClient({
    conat: connect,
    getLogger,
  });
}

const clients: Client[] = [];
export function connect(opts?): Client {
  const cn = server.client({ noCache: true, ...opts });
  clients.push(cn);
  return cn;
}

export async function after() {
  persistServer?.close();
  await rm(tempDir, { force: true, recursive: true });
  await server?.close();
  for (const cn of clients) {
    cn.close();
  }
}

// runs a new ephemeral valkey server on an available port,
// returning that port.
export async function runValkey(): Promise<{
  port: number;
  address: string;
  close: () => void;
}> {
  const port = await getPort();

  // sapwn valkey-server listening on port running in a mode where
  // data is never saved to disk using the nodejs spawn command:
  // // Start valkey-server with in-memory only, no persistence
  const child: ChildProcess = spawn(
    "valkey-server",
    ["--port", String(port), "--save", "", "--appendonly", "no"],
    {
      stdio: "ignore", // or "inherit" for debugging
      detached: true,
    },
  );

  const close = () => {
    if (!child?.pid) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // already dead or not found
    }
  };
  
  return { port, close, address: `valkey://localhost:${port}` };
}
