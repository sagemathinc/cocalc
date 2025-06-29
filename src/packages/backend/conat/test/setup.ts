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

  return createConatServer(options);
}

export let tempDir;
export let server: any = null;
export let persistServer: any = null;

export async function createServer(opts?) {
  const port = await getPort();
  server = await initConatServer({ port, path, ...opts });
  return server;
}

export async function createConatCluster(n: number, opts?) {
  const clusterName = opts?.clusterName ?? "cluster";
  const systemAccountPassword = opts?.systemAccountPassword ?? "secret";
  const servers: { [id: string]: ConatServer } = {};
  for (let i = 0; i < n; i++) {
    const id = `node-${i}`;
    servers[id] = await createServer({
      systemAccountPassword,
      clusterName,
      id,
      ...opts,
    });
  }
  // join every server to every other server
  const v: any[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i != j) {
        v.push(
          servers[`node-${i}`].join({
            address: `http://localhost:${servers[`node-${j}`].options.port}`,
            systemAccountPassword,
            path: "/",
          }),
        );
      }
    }
  }
  await Promise.all(v);
  return servers;
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
  const cn = server.client({ noCache: true, path: "/", ...opts });
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

process.once("exit", () => {
  after();
});

["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    process.exit();
  });
});
