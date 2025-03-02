/*
This code sets things up for each pool and namespace, e.g., defining datasets, creating directories,
etc. as defined in config and names.

WARNING: For efficientcy and sanity, it assumes that once something is setup, it stays setup.
If there is a chaos monkey running around breaking things (e.g., screwing up
file permissions, deleting datasets, etc.,) then this code won't help at all.

OPERATIONS:

- To add a new pool, just create it using zfs with a name sthat starts with POOL_PREFIX.
  It should automatically start getting used within POOLS_CACHE_MS by newly created projects.

*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { POOL_PREFIX, POOLS_CACHE_MS, PROJECTS } from "./config";
import { exec } from "./util";
import {
  archivesDataset,
  archivesMountpoint,
  namespaceDataset,
  projectsDataset,
  projectsPath,
} from "./names";
import { exists } from "@cocalc/backend/misc/async-utils-node";

interface Pool {
  name: string;
  state: "ONLINE" | "OFFLINE";
  size: number;
  allocated: number;
  free: number;
}

type Pools = { [name: string]: Pool };
let poolsCache: null | Pools = null;
export const getPools = reuseInFlight(async (): Promise<Pools> => {
  if (poolsCache != null) {
    return poolsCache;
  }
  const { stdout } = await exec({
    verbose: true,
    command: "zpool",
    args: ["list", "-j", "--json-int", "-o", "size,allocated,free"],
  });
  const { pools } = JSON.parse(stdout);
  const v: { [name: string]: Pool } = {};
  for (const name in pools) {
    if (!name.startsWith(POOL_PREFIX)) {
      continue;
    }
    const pool = pools[name];
    for (const key in pool.properties) {
      pool.properties[key] = pool.properties[key].value;
    }
    v[name] = { name, state: pool.state, ...pool.properties };
  }
  poolsCache = v;
  setTimeout(() => {
    poolsCache = null;
  }, POOLS_CACHE_MS);
  return v;
});

// fine to call this a lot -- it only does something when needed.
export async function initializePool({
  pool,
  namespace,
}: {
  pool: string;
  namespace: string;
}) {
  if (!pool.startsWith(POOL_PREFIX)) {
    throw Error(`pools must start with the prefix '${POOL_PREFIX}'`);
  }
  // archives and projects for each namespace are in this dataset
  await ensureDatasetExists({
    name: namespaceDataset({ namespace, pool }),
  });

  // Initialize archives dataset, used for archiving projects.
  await ensureDatasetExists({
    name: archivesDataset({ pool, namespace }),
    mountpoint: archivesMountpoint({ pool, namespace }),
  });
  // This sets up the parent filesystem for all projects
  // and enable compression and dedup.
  await ensureDatasetExists({
    name: projectsDataset({ namespace, pool }),
  });

  const projects = projectsPath({ namespace });
  if (!(await exists(projects))) {
    await exec({
      verbose: true,
      command: "sudo",
      args: ["mkdir", "-p", projects],
    });
    await exec({
      verbose: true,
      command: "sudo",
      args: ["chmod", "a+rx", PROJECTS],
    });
    await exec({
      verbose: true,
      command: "sudo",
      args: ["chmod", "a+rx", projects],
    });
  }
}

// If a dataset exists, it is assumed to exist henceforth for the life of this process.
// That's fine for *this* application here of initializing pools, since we never delete
// anything here.
const datasetExistsCache = new Set<string>();
async function datasetExists(name: string): Promise<boolean> {
  if (datasetExistsCache.has(name)) {
    return true;
  }
  try {
    await exec({
      verbose: true,
      command: "zfs",
      args: ["list", name],
    });
    datasetExistsCache.add(name);
    return true;
  } catch {
    return false;
  }
}

async function ensureDatasetExists({
  name,
  mountpoint,
}: {
  name: string;
  mountpoint?: string;
}) {
  if (await datasetExists(name)) {
    return;
  }
  await exec({
    verbose: true,
    command: "sudo",
    args: [
      "zfs",
      "create",
      "-o",
      `mountpoint=${mountpoint ? mountpoint : "none"}`,
      "-o",
      "compression=lz4",
      "-o",
      "dedup=on",
      name,
    ],
  });
  // make sure it is very hard to accidentally delete the entire dataset
  // see https://github.com/openzfs/zfs/issues/4134#issuecomment-2565724994
  const safety = `${name}@safety`;
  await exec({
    verbose: true,
    command: "sudo",
    args: ["zfs", "snapshot", safety],
  });
  await exec({
    verbose: true,
    command: "sudo",
    args: ["zfs", "hold", "safety", safety],
  });
}
