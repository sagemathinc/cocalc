import { exec } from "./util";
import { projectDataset } from "./names";
import { get, set } from "./db";
import { context, MIN_QUOTA } from "./config";

export async function setQuota({
  project_id,
  namespace = context.namespace,
  // quota in **number of bytes**.
  // If quota is smaller than actual dataset, then the quota is set to what is
  // actually used (plus 10 MB), hopefully allowing user to delete some data.
  // The quota is never less than MIN_QUOTA.
  // The value stored in database is *also* then set to this amount.
  // So this is not some magic fire and forget setting, but something
  // that cocalc should regularly call when starting the project.
  quota,
}: {
  namespace?: string;
  project_id: string;
  quota: number;
  noSync?: boolean;
}) {
  // this will update current usage in the database
  await syncProperties({ project_id, namespace });
  const { pool, used_by_dataset } = get({ namespace, project_id });
  const used = (used_by_dataset ?? 0) + 10 * 1024;
  if (quota < used) {
    quota = used!;
  }
  quota = Math.max(MIN_QUOTA, quota);
  try {
    await exec({
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
  } finally {
    // this sets quota in database in bytes to whatever was just set above.
    await syncProperties({ project_id, namespace });
  }
}

// Sync with ZFS the properties for the given project_id by
// setting the database to what is in ZFS:
//   - total space used by snapshots
//   - total space used by dataset
//   - the quota
export async function syncProperties({
  project_id,
  namespace = context.namespace,
}: {
  namespace?: string;
  project_id: string;
}) {
  const { pool, archived } = get({ namespace, project_id });
  if (archived) {
    // they can't have changed
    return;
  }
  const dataset = projectDataset({ pool, namespace, project_id });
  const { stdout } = await exec({
    command: "zfs",
    args: [
      "list",
      dataset,
      "-j",
      "--json-int",
      "-o",
      "usedsnap,usedds,refquota",
    ],
  });
  const x = JSON.parse(stdout);
  const { properties } = x.datasets[dataset];
  const y = {
    used_by_snapshots: properties.usedbysnapshots.value,
    used_by_dataset: properties.usedbydataset.value,
    quota: properties.refquota.value ? properties.refquota.value : null,
  };
  set({
    namespace,
    project_id,
    ...y,
  });
}

export async function mountProject({
  project_id,
  namespace = context.namespace,
}: {
  namespace?: string;
  project_id: string;
}) {
  const { pool } = get({ namespace, project_id });
  try {
    await exec({
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
  const { pool } = get({ namespace, project_id });
  try {
    await exec({
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
