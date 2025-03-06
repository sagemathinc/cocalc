/*
Archiving and restore filesystems
*/

import { get, set } from "./db";
import { createSnapshot, zfsGetSnapshots } from "./snapshots";
import {
  filesystemDataset,
  filesystemArchivePath,
  filesystemArchiveFilename,
  filesystemDatasetTemp,
  filesystemMountpoint,
} from "./names";
import { exec } from "./util";
import {
  mountFilesystem,
  unmountFilesystem,
  zfsGetProperties,
} from "./properties";
import { delay } from "awaiting";
import { primaryKey, type PrimaryKey } from "./types";
import { isEqual } from "lodash";

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
  const start = Date.now();
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
  return { milliseconds: Date.now() - start };
}

export async function archiveFilesystem(fs: PrimaryKey) {
  const start = Date.now();
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

  await mountFilesystem(filesystem);
  const find = await hashFileTree({
    verbose: true,
    path: filesystemMountpoint(filesystem),
    what: { ...pk, desc: "getting sha1sum of file listing" },
  });
  // mountpoint will be used for test below, and also no point in archiving
  // if we can't even unmount filesystem
  await unmountFilesystem(filesystem);

  // make *full* zfs send
  await exec({
    verbose: true,
    // have to use sudo sh -c because zfs send only supports writing to stdout:
    command: `sudo sh -c 'zfs send -e -c -R ${filesystemDataset(filesystem)}@${snapshot} > ${stream}'`,
    what: {
      ...pk,
      desc: "zfs send of full filesystem dataset to archive it",
    },
  });

  // verify that the entire send stream is valid
  const temp = filesystemDatasetTemp(filesystem);
  try {
    await exec({
      verbose: true,
      // have to use sudo sh -c because zfs send only supports writing to stdout:
      command: `sudo sh -c 'cat ${stream} | zfs recv ${temp}'`,
      what: {
        ...pk,
        desc: "verify the archive zfs send is valid",
      },
    });
    // inspect the list of all files, and verify that it is identical (has same sha1sum).
    // I think this should be not necessary because the above read didn't fail, and there
    // are supposed to be checksums.  But I also think there are some ways to corrupt a 
    // stream so it reads in as empty (say), so this will definitely catch that.
    const findtest = await hashFileTree({
      verbose: true,
      path: filesystemMountpoint(filesystem), // same mountpoint due to being part of recv data
      what: { ...pk, desc: "getting sha1sum of file listing" },
    });
    if (findtest != find) {
      throw Error(
        "files in archived filesystem do not match. Refusing to archive!",
      );
    }
    // Inspect list of snapshots, and verify they are identical as well. This is another
    // good consistency check that the stream works.
    const snapshots = await zfsGetSnapshots(temp);
    if (!isEqual(snapshots, filesystem.snapshots)) {
      throw Error(
        "snapshots in archived filesystem do not match. Refusing to archive!",
      );
    }
  } finally {
    // destroy the temporary filesystem
    await exec({
      verbose: true,
      command: "sudo",
      args: ["zfs", "destroy", "-r", temp],
      what: {
        ...pk,
        desc: "destroying temporary filesystem dataset used for testing archive stream",
      },
    });
  }

  // destroy dataset
  await exec({
    verbose: true,
    command: "sudo",
    args: ["zfs", "destroy", "-r", filesystemDataset(filesystem)],
    what: { ...pk, desc: "destroying filesystem dataset" },
  });

  // set as archived in database
  set({ ...pk, archived: true });

  return { snapshot, milliseconds: Date.now() - start };
}

// Returns a hash of the file tree.  This uses the find command to get path names, but
// doesn't actually read the *contents* of any files, so it's reasonbly fast.
async function hashFileTree({
  path,
  what,
  verbose,
}: {
  path: string;
  what?;
  verbose?;
}): Promise<String> {
  const { stdout } = await exec({
    verbose,
    command: `sudo sh -c 'cd "${path}" && find . -xdev -printf "%p %s %TY-%Tm-%Td %TH:%TM\n" | sha1sum'`,
    what,
  });
  return stdout;
}
