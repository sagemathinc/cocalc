/*
Archiving and restore filesystems
*/

import { get, set } from "./db";
import { createSnapshot } from "./snapshots";
import {
  filesystemDataset,
  filesystemArchivePath,
  filesystemMountpoint,
  filesystemArchiveFilename,
} from "./names";
import { exec } from "./util";
import { mountFilesystem, zfsGetProperties } from "./properties";
import { delay } from "awaiting";
import { createBackup } from "./backup";
import { primaryKey, type PrimaryKey } from "./types";

export async function dearchiveFilesystem(
  opts: PrimaryKey & {
    // called during dearchive with status updates:
    progress?: (status: {
      // a number between 0 and 100 indicating progress
      progress: number;
      // estimated number of seconds remaining
      seconds_remaining?: number;
      // how much of the total data we have de-archived
      read?: number;
      // total amount of data to de-archive
      total?: number;
    }) => void;
  },
) {
  opts.progress?.({ progress: 0 });
  const pk = primaryKey(opts);
  const filesystem = get(pk);
  if (!filesystem.archived) {
    throw Error("filesystem is not archived");
  }
  const { used_by_dataset, used_by_snapshots } = filesystem;
  const total = (used_by_dataset ?? 0) + (used_by_snapshots ?? 0);
  const dataset = filesystemDataset(filesystem);
  let done = false;
  let progress = 0;
  if (opts.progress && total > 0) {
    (async () => {
      const t0 = Date.now();
      let lastProgress = 0;
      while (!done) {
        await delay(750);
        let x;
        try {
          x = await zfsGetProperties(dataset);
        } catch {
          // this is expected to fail, e.g., if filesystem doesn't exist yet.
        }
        if (done) {
          return;
        }
        const read = x.used_by_dataset + x.used_by_snapshots;
        progress = Math.min(100, Math.round((read * 100) / total));
        if (progress == lastProgress) {
          continue;
        }
        lastProgress = progress;
        let seconds_remaining: number | undefined = undefined;
        if (progress > 0) {
          const rate = (Date.now() - t0) / progress;
          seconds_remaining = Math.ceil((rate * (100 - progress)) / 1000);
        }
        opts.progress?.({ progress, seconds_remaining, total, read });
        if (progress >= 100) {
          break;
        }
      }
    })();
  }

  // now we de-archive it:
  const stream = filesystemArchiveFilename(filesystem);
  await exec({
    verbose: true,
    // have to use sudo sh -c because zfs recv only supports reading from stdin:
    command: `sudo sh -c 'cat ${stream} | zfs recv ${dataset}'`,
    what: {
      ...pk,
      desc: "de-archive a filesystem via zfs recv",
    },
  });
  done = true;
  if (progress < 100) {
    opts.progress?.({
      progress: 100,
      seconds_remaining: 0,
      total,
      read: total,
    });
  }
  await mountFilesystem(filesystem);
  // mounting worked so remove the archive
  await exec({
    command: "sudo",
    args: ["rm", stream],
    what: {
      ...pk,
      desc: "removing the stream during de-archive",
    },
  });
  set({ ...pk, archived: false });
}

export async function archiveFilesystem(fs: PrimaryKey) {
  const pk = primaryKey(fs);
  const filesystem = get(pk);
  if (filesystem.archived) {
    throw Error("filesystem is already archived");
  }
  // create or get most recent snapshot
  const snapshot = await createSnapshot({ ...filesystem, ifChanged: true });
  // where archive of this filesystem goes:
  const archive = filesystemArchivePath(filesystem);
  const stream = filesystemArchiveFilename(filesystem);
  await exec({
    command: "sudo",
    args: ["mkdir", "-p", archive],
    what: { ...pk, desc: "make archive target directory" },
  });
  // make full zfs send
  await exec({
    verbose: true,
    // have to use sudo sh -c because zfs send only supports writing to stdout:
    command: `sudo sh -c 'zfs send -R ${filesystemDataset(filesystem)}@${snapshot} > ${stream}'`,
    what: {
      ...pk,
      desc: "zfs send of full filesystem dataset to archive it",
    },
  });
  // also make a bup backup
  await createBackup(pk);

  // destroy dataset
  await exec({
    verbose: true,
    command: "sudo",
    args: ["zfs", "destroy", "-r", filesystemDataset(filesystem)],
    what: { ...pk, desc: "destroying filesystem dataset" },
  });

  // set as archived in database
  set({ ...pk, archived: true });

  // remove mountpoint -- should not have files in it
  await exec({
    command: "sudo",
    args: ["rmdir", filesystemMountpoint(filesystem)],
    what: { ...pk, desc: "remove mountpoint after archiving filesystem" },
  });

  return { snapshot };
}
