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
import { wait } from "@cocalc/backend/conat/test/util";
import { delay } from "awaiting";
export { setDefaultTimeouts } from "@cocalc/conat/core/client";
export { setDefaultSocketTimeouts } from "@cocalc/conat/socket/util";
export { setDefaultReconnectDelay } from "@cocalc/conat/persist/client";
import { once } from "@cocalc/util/async-utils";
import { until } from "@cocalc/util/async-utils";
import { randomId } from "@cocalc/conat/names";
import { isEqual } from "lodash";

export { wait, delay, once };

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

  const server = createConatServer(options);
  if (server.clusterName == "default") {
    defaultCluster.push(server);
  }
  if (server.state != "ready") {
    await once(server, "ready");
  }
  return server;
}

export let tempDir;
export let server: any = null;
export let persistServer: any = null;

let nodeNumber = 0;
function getNodeId() {
  return `node-${nodeNumber++}`;
}

export async function createServer(opts?) {
  return await initConatServer({
    port: await getPort(),
    path,
    clusterName: "default",
    id: opts?.id ?? getNodeId(),
    systemAccountPassword: "secret",
    ...opts,
  });
}

// add another node to the cluster -- this is still in the same process (not forked), which
// is generally good since you can console.log from it, faster, etc.
// this does connect the new node to all existing nodes.
export const defaultCluster: ConatServer[] = [];
export async function addNodeToDefaultCluster(): Promise<ConatServer> {
  const port = await getPort();
  const node = await initConatServer({
    port,
    path,
    clusterName: "default",
    id: getNodeId(),
    systemAccountPassword: "secret",
  });
  for (const s of defaultCluster) {
    await s.join(node.address());
    await node.join(s.address());
  }
  return node;
}

export async function createConatCluster(n: number, opts?) {
  const clusterName = opts?.clusterName ?? `cluster-${randomId()}`;
  const systemAccountPassword = opts?.systemAccountPassword ?? randomId();
  const servers: { [id: string]: ConatServer } = {};
  for (let i = 0; i < n; i++) {
    const id = `node-${i}`;
    servers[id] = await createServer({
      systemAccountPassword,
      clusterName,
      id,
      autoscanInterval: 0,
      ...opts,
    });
  }
  // join every server to every other server
  const v: any[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i != j) {
        v.push(
          servers[`node-${i}`].join(
            `http://localhost:${servers[`node-${j}`].options.port}`,
          ),
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
  await delay(250);
  server = await createServer({ port });
}

export async function restartPersistServer() {
  await persistServer.close();
  client = connect();
  persistServer = createPersistServer({ client });
}

// one pre-made client
export let client;
export async function before(
  opts: { archive?: string; backup?: string; archiveInterval?: number } = {},
) {
  // syncFiles and tempDir define where the persist server persists data.
  tempDir = await mkdtemp(join(tmpdir(), "conat-test"));
  syncFiles.local = join(tempDir, "local");
  if (opts.archive) {
    syncFiles.archive = join(tempDir, "archive");
  }
  if (opts.archiveInterval) {
    syncFiles.archiveInterval = opts.archiveInterval;
  }
  if (opts.backup) {
    syncFiles.backup = join(tempDir, "backup");
  }

  server = await createServer();
  client = connect();
  persistServer = createPersistServer({ client });
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

// Given a list of servers that are all connected together in a common
// cluster, wait until they all have a consistent view of the interest.
// I.e., the interest object for servers[i] is the same as what every
// other thinks it is.
export async function waitForConsistentState(
  servers: ConatServer[],
  timeout = 10000,
): Promise<void> {
  if (servers.length <= 1) {
    return;
  }
  // @ts-ignore
  const clusterName = servers[0].clusterName;
  if (!clusterName) {
    throw Error("not a cluster");
  }
  const ids = new Set<string>([servers[0].id]);
  for (let i = 1; i < servers.length; i++) {
    // @ts-ignore
    if (servers[i].clusterName != clusterName) {
      throw Error("all servers must be in the same cluster");
    }
    ids.add(servers[i].id);
  }

  if (ids.size != servers.length) {
    throw Error(
      `all servers must have distinct ids -- ${JSON.stringify(servers.map((x) => x.id))}`,
    );
  }

  const start = Date.now();
  await until(
    () => {
      for (let i = 0; i < servers.length; i++) {
        if (servers[i].state == "closed") {
          return true;
        }
        // now look at everybody else's view of servers[i].
        // @ts-ignore
        const a = servers[i].interest.serialize().patterns;
        const b = servers[i].sticky;
        const hashServer = servers[i].hash();
        for (let j = 0; j < servers.length; j++) {
          if (i != j) {
            // @ts-ignore
            const link = servers[j].clusterLinks[clusterName]?.[servers[i].id];
            if (link == null) {
              if (Date.now() - start > 3000) {
                console.log(`node ${j} is not connected to node ${i}`);
              }
              return false;
            }
            const hashLink = link.hash();
            const x = link.interest.serialize().patterns;
            const y = link.sticky;
            const showInfo = () => {
              for (const type of ["interest", "sticky"]) {
                console.log(
                  `server stream ${type}: `,
                  hashServer[type],
                  // @ts-ignore
                  servers[i].clusterStreams[type].stream.client.id,
                  // @ts-ignore
                  servers[i].clusterStreams[type].stream.storage.path,
                  // @ts-ignore
                  servers[i].clusterStreams[type].seqs(),
                  // @ts-ignore
                  //servers[i].clusterStreams.interest.getAll(),
                );

                console.log(
                  `link stream ${type}: `,
                  hashLink[type],
                  // @ts-ignore
                  link.streams[type].stream.client.id,
                  // @ts-ignore
                  link.streams[type].stream.storage.path,
                  // @ts-ignore
                  link.streams[type].seqs(),
                  // @ts-ignore
                  //link.streams.interest.getAll(),
                );
              }
              console.log("waitForConsistentState", {
                i,
                j,
                serverInterest: a,
                linkInterest: x,
                serverSticky: b,
                linkSticky: y,
              });
            };
            if (!isEqual(hashServer, hashLink)) {
              if (Date.now() - start > 3000) {
                console.log("hashes are not equal");
                // likely going to fail
                showInfo();
              }
              return false;
            }
            if (!isEqual(a, x) /*|| !isEqual(b, y) */) {
              // @ts-ignore
              const seqs0 = servers[i].clusterStreams.interest.seqs();
              const seqs1 = link.streams.interest.seqs();
              if (
                !isEqual(
                  seqs0.slice(0, seqs1.length),
                  seqs1.slice(0, seqs0.length),
                )
              ) {
                showInfo();
                throw Error(`inconsistent initial sequences`);
              }

              if (Date.now() - start > 3000) {
                // likely going to fail
                showInfo();
              }

              // not yet equal
              return false;
            }
          }
        }
      }
      return true;
    },
    { timeout },
  );
}

export async function after() {
  persistServer?.close();
  await rm(tempDir, { force: true, recursive: true });
  try {
    server?.close();
  } catch {}
  for (const cn of clients) {
    try {
      cn.close();
    } catch {}
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
