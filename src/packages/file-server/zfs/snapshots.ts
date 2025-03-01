/*
Manage creating and deleting rolling snapshots of a given project's filesystem.
*/

import { executeCode } from "@cocalc/backend/execute-code";
import { context, dbProject, getDb } from "./index";
import { projectDataset } from "./names";

// We make/update snapshots periodically, with this being the minimum interval.
//const SNAPSHOT_INTERVAL_MS = 60 * 30 * 1000;
const SNAPSHOT_INTERVAL_MS = 10 * 1000;

// Lengths of time in minutes to keep these snapshots
const SNAPSHOT_INTERVALS_MS = {
  halfly: 30 * 1000 * 60,
  daily: 60 * 24 * 1000 * 60,
  weekly: 60 * 24 * 7 * 1000 * 60,
  monthly: 60 * 24 * 7 * 4 * 1000 * 60,
};

// How many of each type of snapshot to retain
const SNAPSHOT_COUNTS = { halfly: 24, daily: 14, weekly: 7, monthly: 4 };

export async function createSnapshot({
  project_id,
  namespace = context.namespace,
}: {
  project_id: string;
  namespace?: string;
}): Promise<string | undefined> {
  const project = await dbProject({ project_id, namespace });
  if (project == null) {
    throw Error("no such project");
  }
  if (project.archived) {
    // never snapshot an archived project
    return;
  }
  const snapshots = project.snapshots?.split(",") ?? [];
  if (snapshots.length > 0) {
    // check for sufficiently recent snapshot
    const last = new Date(snapshots[snapshots.length - 1]);
    if (Date.now() - last.valueOf() < SNAPSHOT_INTERVAL_MS) {
      // snapshot sufficiently recent
      return;
    }
  }

  // Check to see if nothing change on disk since last snapshot - if so, don't make a new one:
  if (snapshots.length > 0) {
    const written = await getWritten({ project_id, namespace });
    if (written == 0) {
      // for sure definitely nothing written, so no possible
      // need to make a snapshot
      return;
    }
  }

  const t = new Date().toISOString();
  await executeCode({
    verbose: true,
    command: "sudo",
    args: [
      "zfs",
      "snapshot",
      `${projectDataset({ project_id, namespace, pool: project.pool })}@${t}`,
    ],
  });
  snapshots.push(t);
  const db = getDb();
  db.prepare(
    "UPDATE projects SET snapshots=? WHERE project_id=? AND namespace=?",
  ).run(snapshots.join(","), project_id, namespace);
  return t;
}

async function getWritten({ project_id, namespace }) {
  const { pool } = await dbProject({ project_id, namespace });
  const { stdout } = await executeCode({
    verbose: true,
    command: "zfs",
    args: [
      "list",
      "-Hpo",
      "written",
      projectDataset({ project_id, namespace, pool }),
    ],
  });
  return parseInt(stdout);
}

/*
import { splitlines } from "@cocalc/util/misc";

async function getDiff({ project_id, namespace, snapshot }) {
  const { pool } = await dbProject({ project_id, namespace });
  const { stdout } = await executeCode({
    verbose: true,
    command: "sudo",
    args: [
      "zfs",
      "diff",
      `${projectDataset({ project_id, namespace, pool })}@${snapshot}`,
    ],
  });
  return splitlines(stdout);
}
*/
