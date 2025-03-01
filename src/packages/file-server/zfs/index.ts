import { executeCode } from "@cocalc/backend/execute-code";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { isValidUUID } from "@cocalc/util/misc";

const DEFAULT_NAMESPACE = process.env.NAMESPACE ?? "default";

const DEFAULT_QUOTA = "1G";

// We periodically do "zpool list" to find out what pools are available
// and how much space they have left.  This info is cached for this long
// to avoid excessive calls:
const POOLS_CACHE_MS = 15000;

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
  const { stdout } = await executeCode({
    verbose: true,
    command: "zpool",
    args: ["list", "-j", "--json-int", "-o", "size,allocated,free"],
  });
  const { pools } = JSON.parse(stdout);
  const v: { [name: string]: Pool } = {};
  for (const name in pools) {
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

interface Project {
  namespace: string;
  project_id: string;
  pool: string;
  // if set, its location where project is archived
  archived?: string;
  // optional arbitrary affinity string - we attempt if possible to put
  // projects with the same affinity in the same pool, to improve chances of dedup.
  affinity?: string;
}

import Database from "better-sqlite3";
let db: null | Database.Database;
export function getDb(): Database.Database {
  if (db == null) {
    db = new Database("projects.db");
    db.prepare(
      "CREATE TABLE IF NOT EXISTS projects (namespace TEXT, project_id TEXT, pool TEXT, archived TEXT, affinity TEXT, PRIMARY KEY (namespace, project_id))",
    ).run();
  }
  return db!;
}

export function dbProject({
  namespace = DEFAULT_NAMESPACE,
  project_id,
}: {
  namespace?: string;
  project_id: string;
}): Project {
  const db = getDb();
  return db
    .prepare("SELECT * FROM projects WHERE namespace=? AND project_id=?")
    .get(namespace, project_id) as Project;
}

export async function getProject(opts) {
  const project = dbProject(opts);
  if (project != null && !project.archived) {
    return project;
  }
  return await createProject(opts);
}

export async function createProject({
  namespace = DEFAULT_NAMESPACE,
  project_id,
  affinity,
  quota = DEFAULT_QUOTA,
}: {
  namespace?: string;
  project_id: string;
  affinity?: string;
  quota?: string;
}) {
  const project = dbProject({ namespace, project_id });
  if (project != null) {
    return project;
  }
  if (!isValidUUID(project_id)) {
    throw Error(`project_id=${project_id} must be a valid uuid`);
  }
  const db = getDb();
  // select a pool:
  let pool: undefined | string = undefined;
  if (affinity) {
    // if affinity is set, have preference to use same pool as other projects with this affinity.
    const x = db
      .prepare(
        "SELECT pool, COUNT(pool) AS cnt FROM projects WHERE namespace=? AND affinity=? ORDER by cnt DESC",
      )
      .get(namespace, affinity) as { pool: string; cnt: number } | undefined;
    pool = x?.pool;
    if (pool) {
      console.log("using pool because of affinity", { pool, affinity });
    }
  }
  if (!pool) {
    // assign one with *least* projects
    const x = db
      .prepare(
        "SELECT pool, COUNT(pool) AS cnt FROM projects GROUP BY pool ORDER by cnt ASC",
      )
      .all() as any;
    const pools = await getPools();
    if (Object.keys(pools).length > x.length) {
      // rare case: there exists a pool that isn't used yet, so not
      // represented in above query at all; use it
      const v = new Set<string>();
      for (const { pool } of x) {
        v.add(pool);
      }
      for (const name in pools) {
        if (!v.has(name)) {
          pool = name;
          break;
        }
      }
    } else {
      // just use the least crowded
      pool = x[0].pool;
    }
  }
  if (!pool) {
    throw Error("bug -- unable to select a pool");
  }

  const { cnt } = db
    .prepare(
      "SELECT COUNT(pool) AS cnt FROM projects WHERE pool=? AND namespace=?",
    )
    .get(pool, namespace) as { cnt: number };
  if (cnt == 0) {
    try {
      await executeCode({
        verbose: true,
        command: "sudo",
        args: [
          "zfs",
          "create",
          "-o",
          `mountpoint=/projects/${namespace}`,
          "-o",
          "compression=lz4",
          "-o",
          "dedup=on",
          `${pool}/${namespace}`,
        ],
      });
    } catch (err) {
      if (`${err}`.includes("already exists")) {
        // fine -- happens if we delete all projects then create one
      } else {
        throw err;
      }
    }
  }

  // create filesystem on the selected pool
  await executeCode({
    verbose: true,
    command: "sudo",
    args: [
      "zfs",
      "create",
      "-o",
      `mountpoint=/projects/${namespace}/${project_id}`,
      "-o",
      "compression=lz4",
      "-o",
      "dedup=on",
      "-o",
      `refquota=${quota}`,
      `${pool}/${namespace}/${project_id}`,
    ],
  });

  // update database
  db.prepare(
    "INSERT INTO projects(namespace,project_id,pool,affinity) VALUES(?,?,?,?)",
  ).run(namespace, project_id, pool, affinity);

  return dbProject({ namespace, project_id });
}

export async function setQuota({
  project_id,
  namespace = DEFAULT_NAMESPACE,
  quota,
}: {
  namespace?: string;
  project_id: string;
  quota: string;
}) {
  const { pool } = dbProject({ namespace, project_id });
  await executeCode({
    verbose: true,
    command: "sudo",
    args: [
      "zfs",
      "set",
      // refquota so snapshots don't count against the user
      `refquota=${quota}`,
      `${pool}/${namespace}/${project_id}`,
    ],
  });
}

export async function deleteProject({
  project_id,
  namespace = DEFAULT_NAMESPACE,
}: {
  namespace?: string;
  project_id: string;
}) {
  const project = dbProject({ namespace, project_id });
  if (project == null) {
    // project is already deleted
    return;
  }
  await executeCode({
    verbose: true,
    command: "sudo",
    args: [
      "zfs",
      "destroy",
      "-r",
      `${project.pool}/${namespace}/${project_id}`,
    ],
  });
  await executeCode({
    verbose: true,
    command: "sudo",
    args: ["rmdir", `/projects/${namespace}/${project_id}`],
  });
  const db = getDb();
  db.prepare("DELETE FROM projects WHERE project_id=?").run(project_id);
}

export async function mountProject({
  project_id,
  namespace = DEFAULT_NAMESPACE,
}: {
  namespace?: string;
  project_id: string;
}) {
  const { pool } = dbProject({ namespace, project_id });
  try {
    await executeCode({
      verbose: true,
      command: "sudo",
      args: ["zfs", "mount", `${pool}/${namespace}/${project_id}`],
    });
  } catch (err) {
    if (`${err}`.includes("already mounted")) {
      // fine
      return;
    }
    throw err;
  }
}

export async function unmountProject({
  project_id,
  namespace = DEFAULT_NAMESPACE,
}: {
  namespace?: string;
  project_id: string;
}) {
  const { pool } = dbProject({ namespace, project_id });
  try {
    await executeCode({
      verbose: true,
      command: "sudo",
      args: ["zfs", "unmount", `${pool}/${namespace}/${project_id}`],
    });
  } catch (err) {
    if (`${err}`.includes("not currently mounted")) {
      // fine
    } else {
      throw err;
    }
  }
}
