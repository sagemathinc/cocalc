import { exec } from "./util";
import { filesystemDataset } from "./names";
import { get, set } from "./db";
import { MIN_QUOTA } from "./config";
import { primaryKey, type PrimaryKey } from "./types";

export async function setQuota({
  // quota in **number of bytes**.
  // If quota is smaller than actual dataset, then the quota is set to what is
  // actually used (plus 10 MB), hopefully allowing user to delete some data.
  // The quota is never less than MIN_QUOTA.
  // The value stored in database is *also* then set to this amount.
  // So this is not some magic fire and forget setting, but something
  // that cocalc should regularly call when starting the filesystem.
  quota,
  noSync,
  ...fs
}: {
  quota: number;
  noSync?: boolean;
} & PrimaryKey) {
  const pk = primaryKey(fs);
  // this will update current usage in the database
  await syncProperties(pk);
  const { pool, used_by_dataset } = get(pk);
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
        filesystemDataset({ pool, ...pk }),
      ],
    });
  } finally {
    // this sets quota in database in bytes to whatever was just set above.
    await syncProperties(pk);
  }
}

// Sync with ZFS the properties for the given filesystem by
// setting the database to what is in ZFS:
//   - total space used by snapshots
//   - total space used by dataset
//   - the quota
export async function syncProperties(fs: PrimaryKey) {
  const pk = primaryKey(fs);
  const { pool, archived } = get(pk);
  if (archived) {
    // they can't have changed
    return;
  }
  set({
    ...pk,
    ...(await zfsGetProperties(filesystemDataset({ pool, ...pk }))),
  });
}

export async function zfsGetProperties(dataset: string): Promise<{
  used_by_snapshots: number;
  used_by_dataset: number;
  quota: number | null;
}> {
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
  return {
    used_by_snapshots: properties.usedbysnapshots.value,
    used_by_dataset: properties.usedbydataset.value,
    quota: properties.refquota.value ? properties.refquota.value : null,
  };
}

export async function mountFilesystem(fs: PrimaryKey) {
  const pk = primaryKey(fs);
  const { pool } = get(pk);
  try {
    await exec({
      command: "sudo",
      args: ["zfs", "mount", filesystemDataset({ pool, ...pk })],
      what: { ...pk, desc: "mount filesystem" },
    });
  } catch (err) {
    if (`${err}`.includes("already mounted")) {
      // fine
      return;
    }
    throw err;
  }
}

export async function unmountFilesystem(fs: PrimaryKey) {
  const pk = primaryKey(fs);
  const { pool } = get(pk);
  try {
    await exec({
      verbose: true,
      command: "sudo",
      args: ["zfs", "unmount", filesystemDataset({ pool, ...pk })],
      what: { ...pk, desc: "unmount filesystem" },
    });
  } catch (err) {
    if (`${err}`.includes("not currently mounted")) {
      // fine
    } else {
      throw err;
    }
  }
}
