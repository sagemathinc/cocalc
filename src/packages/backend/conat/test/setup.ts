import { getPort } from "@cocalc/backend/conat/test/util";
import { type Client } from "@cocalc/conat/core/client";
import {
  init as createConatServer,
  type Options,
  type ConatServer,
} from "@cocalc/conat/core/server";
import { Server } from "socket.io";
import getLogger from "@cocalc/backend/logger";
import { setConatClient } from "@cocalc/conat/client";
import { server as createPersistServer } from "@cocalc/backend/conat/persist";
import { syncFiles } from "@cocalc/conat/persist/context";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
export { wait } from "@cocalc/backend/conat/test/util";
export { delay } from "awaiting";

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
    Server,
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
    conat: async () => connect(),
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
