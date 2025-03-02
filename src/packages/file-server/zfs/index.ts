import { executeCode } from "@cocalc/backend/execute-code";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { projectDataset } from "./names";
import { createSnapshot } from "./snapshots";
import { dbProject, getDb, projectExists } from "./db";
import { createProject } from "./create";
import { context, POOL_PREFIX, POOLS_CACHE_MS } from "./config";

export { createSnapshot };
export {
  getModifiedFiles,
  deleteSnapshot,
  deleteExtraSnapshotsOfActiveProjects,
  deleteExtraSnapshots,
} from "./snapshots";
export { dbAllProjects, getRecentProjects } from "./db";
export { shareNFS, unshareNFS } from "./nfs";
export { createProject, deleteProject } from "./create";

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

export function touch({
  namespace = context.namespace,
  project_id,
}: {
  namespace?: string;
  project_id: string;
}) {
  const db = getDb();
  db.prepare(
    "UPDATE projects SET last_edited=? WHERE project_id=? AND namespace=?",
  ).run(new Date().toISOString(), project_id, namespace);
}

export async function getProject(opts) {
  const exists = projectExists(opts);
  if (!exists) {
    // TODO: maybe a check for "transition from old format"...?
    // Or maybe we just populate the sqlite db with info about all
    // projects ever on initialization.
    return await createProject(opts);
  }
  const project = dbProject(opts);
  if (!project.archived) {
    return project;
  }
  if (project.archived) {
    throw Error("TODO:  de-archive project here and return that");
  }
}

export async function setQuota({
  project_id,
  namespace = context.namespace,
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
      projectDataset({ pool, namespace, project_id }),
    ],
  });
}

export async function mountProject({
  project_id,
  namespace = context.namespace,
}: {
  namespace?: string;
  project_id: string;
}) {
  const { pool } = dbProject({ namespace, project_id });
  try {
    await executeCode({
      command: "sudo",
      args: ["zfs", "mount", projectDataset({ pool, namespace, project_id })],
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
  namespace = context.namespace,
}: {
  namespace?: string;
  project_id: string;
}) {
  const { pool } = dbProject({ namespace, project_id });
  try {
    await executeCode({
      verbose: true,
      command: "sudo",
      args: ["zfs", "unmount", projectDataset({ pool, namespace, project_id })],
    });
  } catch (err) {
    if (`${err}`.includes("not currently mounted")) {
      // fine
    } else {
      throw err;
    }
  }
}
