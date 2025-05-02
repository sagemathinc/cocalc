/*
This code sets things up for each pool and namespace, e.g., defining datasets, creating directories,
etc. as defined in config and names.

WARNING: For efficientcy and sanity, it assumes that once something is setup, it stays setup.
If there is a chaos monkey running around breaking things (e.g., screwing up
file permissions, deleting datasets, etc.,) then this code won't help at all.

OPERATIONS:

- To add a new pool, just create it using zfs with a name sthat starts with context.PREFIX.
  It should automatically start getting used within POOLS_CACHE_MS by newly created filesystems.

*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { context, DEFAULT_POOL_SIZE, POOLS_CACHE_MS } from "./config";
import { exec } from "./util";
import {
  archivesDataset,
  archivesMountpoint,
  namespaceDataset,
  filesystemsDataset,
  filesystemsPath,
  bupDataset,
  bupMountpoint,
  tempDataset,
  poolImageDirectory,
  poolImageFile,
} from "./names";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { getNamespacesAndPools } from "./db";

// Make sure all pools and namespaces are initialized for all existing filesystems.
// This should be needed after booting up the server and importing the pools.
export async function initializeAllPools() {
  // TODO: maybe import all here?

  for (const { namespace, pool } of getNamespacesAndPools()) {
    await initializePool({ namespace, pool });
  }
}

interface Pool {
  name: string;
  state: "ONLINE" | "OFFLINE";
  size: number;
  allocated: number;
  free: number;
}

type Pools = { [name: string]: Pool };
let poolsCache: { [prefix: string]: Pools } = {};

export const getPools = reuseInFlight(
  async ({ noCache }: { noCache?: boolean } = {}): Promise<Pools> => {
    if (!noCache && poolsCache[context.DATA]) {
      return poolsCache[context.DATA];
    }
    const { stdout } = await exec({
      verbose: true,
      command: "zpool",
      args: ["list", "-j", "--json-int", "-o", "size,allocated,free"],
    });
    const { pools } = JSON.parse(stdout);
    const v: { [name: string]: Pool } = {};
    for (const name in pools) {
      if (!name.startsWith(context.PREFIX)) {
        continue;
      }
      const pool = pools[name];
      for (const key in pool.properties) {
        pool.properties[key] = pool.properties[key].value;
      }
      v[name] = { name, state: pool.state, ...pool.properties };
    }
    poolsCache[context.PREFIX] = v;
    if (!process.env.COCALC_TEST_MODE) {
      // only clear cache in non-test mode
      setTimeout(() => {
        delete poolsCache[context.PREFIX];
      }, POOLS_CACHE_MS);
    }
    return v;
  },
);

// OK to call this again even if initialized already.
export const initializePool = reuseInFlight(
  async ({
    namespace = context.namespace,
    pool,
  }: {
    namespace?: string;
    pool: string;
  }) => {
    const image = poolImageFile({ pool });
    if (!(await exists(image))) {
      const dir = poolImageDirectory({ pool });

      await exec({
        verbose: true,
        command: "sudo",
        args: ["mkdir", "-p", dir],
      });

      await exec({
        verbose: true,
        command: "sudo",
        args: ["truncate", "-s", DEFAULT_POOL_SIZE, image],
        what: { pool, desc: "create sparse image file" },
      });

      // create the pool
      await exec({
        verbose: true,
        command: "sudo",
        args: [
          "zpool",
          "create",
          "-o",
          "feature@fast_dedup=enabled",
          "-m",
          "none",
          pool,
          image,
        ],
        what: {
          pool,
          desc: `create the zpool ${pool} using the device ${image}`,
        },
      });
    } else {
      // make sure pool is imported
      try {
        await exec({
          verbose: true,
          command: "zpool",
          args: ["list", pool],
          what: { pool, desc: `check if ${pool} needs to be imported` },
        });
      } catch {
        const dir = poolImageDirectory({ pool });
        await exec({
          verbose: true,
          command: "sudo",
          args: ["zpool", "import", pool, "-d", dir],
          what: {
            pool,
            desc: `import the zpool ${pool} from ${dir}`,
          },
        });
      }
    }

    // archives and filesystems for each namespace are in this dataset
    await ensureDatasetExists({
      name: namespaceDataset({ namespace, pool }),
    });

    // Initialize archives dataset, used for archiving filesystems.
    await ensureDatasetExists({
      name: archivesDataset({ pool, namespace }),
      mountpoint: archivesMountpoint({ pool, namespace }),
    });
    // This sets up the parent filesystem for all filesystems
    // and enable compression and dedup.
    await ensureDatasetExists({
      name: filesystemsDataset({ namespace, pool }),
    });
    await ensureDatasetExists({
      name: tempDataset({ namespace, pool }),
      dedup: "off",
    });
    // Initialize bup dataset, used for backups.
    await ensureDatasetExists({
      name: bupDataset({ pool, namespace }),
      mountpoint: bupMountpoint({ pool, namespace }),
      compression: "off",
      dedup: "off",
    });

    const filesystems = filesystemsPath({ namespace });
    if (!(await exists(filesystems))) {
      await exec({
        verbose: true,
        command: "sudo",
        args: ["mkdir", "-p", filesystems],
      });
      await exec({
        verbose: true,
        command: "sudo",
        args: ["chmod", "a+rx", context.FILESYSTEMS],
      });
      await exec({
        verbose: true,
        command: "sudo",
        args: ["chmod", "a+rx", filesystems],
      });
    }
  },
);

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

async function isMounted(dataset): Promise<boolean> {
  const { stdout } = await exec({
    command: "zfs",
    args: ["get", "mounted", dataset, "-j"],
  });
  const x = JSON.parse(stdout);
  return x.datasets[dataset].properties.mounted.value == "yes";
}

async function ensureDatasetExists({
  name,
  mountpoint,
  compression = "lz4",
  dedup = "on",
}: {
  name: string;
  mountpoint?: string;
  compression?: "lz4" | "off";
  dedup?: "on" | "off";
}) {
  if (await datasetExists(name)) {
    if (mountpoint && !(await isMounted(name))) {
      // ensure mounted
      await exec({
        verbose: true,
        command: "sudo",
        args: ["zfs", "mount", name],
      });
    }
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
      `compression=${compression}`,
      "-o",
      `dedup=${dedup}`,
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
