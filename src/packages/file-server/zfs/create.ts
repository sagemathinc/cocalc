import { create, get, getDb, projectExists } from "./db";
import { exec } from "./util";
import { projectDataset, projectMountpoint } from "./names";
import { getPools, initializePool } from "./pools";
import { dearchiveProject } from "./archive";
import { context, DEFAULT_QUOTA, UID, GID } from "./config";
import { isValidUUID } from "@cocalc/util/misc";
import { createSnapshot } from "./snapshots";

export async function createProject({
  namespace = context.namespace,
  project_id,
  affinity,
  quota = DEFAULT_QUOTA,
  source_project_id,
}: {
  namespace?: string;
  project_id: string;
  affinity?: string;
  quota?: string;
  source_project_id?: string;
}) {
  if (projectExists({ namespace, project_id })) {
    return get({ namespace, project_id });
  }
  if (!isValidUUID(project_id)) {
    throw Error(`project_id=${project_id} must be a valid uuid`);
  }
  const source = source_project_id
    ? get({ namespace, project_id: source_project_id })
    : undefined;

  const db = getDb();
  // select a pool:
  let pool: undefined | string = undefined;

  if (source != null) {
    // use same pool as source project.  (we could use zfs send/recv but that's much slower)
    pool = source.pool;
  } else {
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
        if (x.length == 0) {
          throw Error("cannot create project -- there are no available pools");
        }
        // just use the least crowded
        pool = x[0].pool;
      }
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
    // initialize pool for use in this namespace:
    await initializePool({ pool, namespace });
  }

  if (source_project_id == null || source == null) {
    // create filesystem for project on the selected pool
    const mountpoint = projectMountpoint({ namespace, project_id });
    const dataset = projectDataset({ pool, namespace, project_id });
    await exec({
      verbose: true,
      command: "sudo",
      args: [
        "zfs",
        "create",
        "-o",
        `mountpoint=${mountpoint}`,
        "-o",
        "compression=lz4",
        "-o",
        "dedup=on",
        "-o",
        `refquota=${quota}`,
        dataset,
      ],
      what: {
        project_id,
        namespace,
        desc: `create filesystem ${dataset} for project on the selected pool mounted at ${mountpoint}`,
      },
    });
    await exec({
      verbose: true,
      command: "sudo",
      args: ["chown", "-R", `${UID}:${GID}`, mountpoint],
      whate: {
        project_id,
        namespace,
        desc: `setting permissions of filesystem for project at ${mountpoint}`,
      },
    });
  } else {
    // clone source
    // First ensure project isn't archived
    // (we might alternatively de-archive to make the clone...?)
    await dearchiveProject({ project_id: source_project_id, namespace });
    // Get newest snapshot, or make one if there are none
    let snapshot;
    if (source.snapshots.length == 0) {
      snapshot = await createSnapshot({
        project_id: source_project_id,
        namespace,
      });
    } else {
      snapshot = source.snapshots[source.snapshots.length - 1];
    }
    if (!snapshot) {
      throw Error("bug -- source should have a new snapshot");
    }
    const source_snapshot = `${projectDataset({ pool, namespace, project_id: source_project_id })}@${snapshot}`;
    await exec({
      verbose: true,
      command: "sudo",
      args: [
        "zfs",
        "clone",
        "-o",
        `mountpoint=${projectMountpoint({ namespace, project_id })}`,
        "-o",
        "compression=lz4",
        "-o",
        "dedup=on",
        // TODO/worry: clone gets the quota of source (hence quota not specified here)
        source_snapshot,
        projectDataset({ pool, namespace, project_id }),
      ],
      what: {
        project_id,
        namespace,
        desc: `clone filesystem for project from ${source_snapshot}`,
      },
    });
  }

  // update database
  create({ namespace, project_id, pool, affinity });
  return get({ namespace, project_id });
}

export async function deleteProject({
  project_id,
  namespace = context.namespace,
}: {
  namespace?: string;
  project_id: string;
}) {
  const { pool } = get({ namespace, project_id });
  const dataset = projectDataset({ pool, namespace, project_id });
  await exec({
    verbose: true,
    command: "sudo",
    args: ["zfs", "destroy", "-r", dataset],
    what: {
      project_id,
      namespace,
      desc: `destroy dataset ${dataset} containing the project`,
    },
  });
  await exec({
    verbose: true,
    command: "sudo",
    args: ["rmdir", projectMountpoint({ namespace, project_id })],
    what: {
      project_id,
      namespace,
      desc: `delete directory '${projectMountpoint({ namespace, project_id })}' where project was stored`,
    },
  });
  const db = getDb();
  db.prepare("DELETE FROM projects WHERE project_id=? AND namespace=?").run(
    project_id,
    namespace,
  );
}
