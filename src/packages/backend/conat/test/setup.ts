import { getPort } from "@cocalc/backend/conat/test/util";
import { type Client } from "@cocalc/backend/conat/conat";
import {
  init as createConatServer,
  type Options,
  type ConatServer,
} from "@cocalc/conat/core/server";
import { Server } from "socket.io";
import getLogger from "@cocalc/backend/logger";
import { setNatsClient } from "@cocalc/conat/client";
import { sha1 } from "@cocalc/backend/sha1";

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
export let port;
export let address;
export async function before() {
  port = await getPort();
  address = `http://localhost:${port}`;
  server = await initConatServer({ port, path });
  setNatsClient({
    getNatsEnv: async () => {
      return { cn: connect(), sha1 } as any;
    },
    getLogger,
  });
}

const clients: Client[] = [];
export function connect() {
  const cn = server.client();
  clients.push(cn);
  return cn;
}

export async function after() {
  await server.close();
  for (const cn of clients) {
    cn.close();
  }
}
