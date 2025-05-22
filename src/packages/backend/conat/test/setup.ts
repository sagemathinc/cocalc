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
import { sha1 } from "@cocalc/backend/sha1";
import {
  initServer as initPersistServer,
  terminateServer as terminatePersistServer,
} from "@cocalc/backend/conat/persist";
import { syncFiles } from "@cocalc/conat/persist/context";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
import { delay } from "awaiting";

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

export let server;
export let tempDir;

export async function createServer(opts?) {
  const port = await getPort();
  const address = `http://localhost:${port}`;
  server = await initConatServer({ port, path, ...opts });
  await initPersistServer({ client: connect() });
  return server;
}

export async function before() {
  tempDir = await mkdtemp(join(tmpdir(), "conat-test"));
  server = await createServer();
  syncFiles.local = join(tempDir, "local");
  syncFiles.archive = join(tempDir, "archive");
  setConatClient({
    getNatsEnv: async () => {
      return { cn: connect(), sha1 } as any;
    },
    getLogger,
  });
}

const clients: Client[] = [];
export function connect(...args): Client {
  const cn = server.client(...args);
  clients.push(cn);
  return cn;
}

export async function after() {
  terminatePersistServer();
  await rm(tempDir, { force: true, recursive: true });
  await server.close();
  for (const cn of clients) {
    cn.close();
  }
}
