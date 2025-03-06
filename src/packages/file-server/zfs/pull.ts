/*
Use zfs replication over ssh to pull recent filesystems from 
one file-server to another one.

This will be used for:

- backup
- moving a filesystem from one region/cluster to another
*/

import {
  type Filesystem,
  type RawFilesystem,
  primaryKey,
  PrimaryKey,
} from "./types";
import { exec } from "./util";
import {
  databaseFilename,
  filesystemDataset,
  filesystemMountpoint,
} from "./names";
import { filesystemExists, getRecent, get, set } from "./db";
import getLogger from "@cocalc/backend/logger";
import { getSnapshots } from "./snapshots";
import { createFilesystem, deleteFilesystem } from "./create";
import { context } from "./config";
import { archiveFilesystem, dearchiveFilesystem } from "./archive";
import { deleteSnapshot } from "./snapshots";
import { isEqual } from "lodash";
import { join } from "path";
import { readdir, unlink } from "fs/promises";

const logger = getLogger("file-server:zfs:pull");

// number of remote backups of db sqlite file to keep.
const NUM_DB_TO_KEEP = 10;

// This is used for unit testing. It's what fields should match
// after doing a sync, except snapshots where local is a superset,
// unless you pull with deleteSnapshots set to true.
export const SYNCED_FIELDS = [
  // these four fields identify the filesystem, so they better get sync'd:
  "namespace",
  "owner_type",
  "owner_id",
  "name",
  // snaphots -- reflects that we replicated properly.
  "snapshots",

  // last_edited is useful for targetting sync work and making decisions, e.g.., should we delete
  "last_edited",
  // these just get directly sync'd. They aren't used unless somehow local were to actually server
  // data directly.
  "affinity",
  "nfs",
];

interface Remote {
  // remote = user@hostname that you can ssh to
  remote: string;
  // filesystem prefix of the remote server, so {prefix}/database.sqlite3 has the
  // database that defines the state of the remote server.
  prefix: string;
}

// Copy from remote to here every filesystem that has changed since cutoff.
export async function pull({
  cutoff,
  filesystem,
  remote,
  prefix,
  deleteFilesystemCutoff,
  deleteSnapshots,
  dryRun,
}: Remote & {
  // pulls everything that's changed with remote last_edited >= cutoff.
  cutoff?: Date;
  // alternatively -- if given, only pull this filesystem and nothing else:
  filesystem?: PrimaryKey;

  // DANGER: if set, any local filesystem with
  //    cutoff <= last_edited <= deleteFilesystemCutoff
  // gets actually deleted. This makes it possible, e.g., to delete every filesystem
  // that was deleted on the main server in the last 6 months and deleted at least 1
  // month ago, so we have a bit of time before destroy backups.
  deleteFilesystemCutoff?: Date;
  // if true, delete local snapshots if they were deleted on the remote.
  deleteSnapshots?: boolean;
  // just say how much will happen, but don't do anything.
  dryRun?: boolean;
}): Promise<{
  toUpdate: { remoteFs: Filesystem; localFs?: Filesystem }[];
  toDelete: RawFilesystem[];
}> {
  logger.debug("pull: from ", { remote, prefix, cutoff, filesystem });
  if (prefix.startsWith("/")) {
    throw Error("prefix should not start with /");
  }
  if (cutoff == null) {
    cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  }
  logger.debug("pull: get the remote sqlite database");
  await exec({ command: "mkdir", args: ["-p", context.PULL] });
  const remoteDatabase = join(
    context.PULL,
    `${remote}:${prefix}---${new Date().toISOString()}.sqlite3`,
  );
  // delete all but the most recent remote database files for this remote/prefix (?).
  const oldDbFiles = (await readdir(context.PULL))
    .sort()
    .filter((x) => x.startsWith(`${remote}:${prefix}---`))
    .slice(0, -NUM_DB_TO_KEEP);
  for (const path of oldDbFiles) {
    await unlink(join(context.PULL, path));
  }

  await exec({
    command: "scp",
    args: [`${remote}:/${databaseFilename(prefix)}`, remoteDatabase],
  });

  logger.debug("pull: compare state");
  const recent =
    filesystem != null
      ? [get(filesystem, remoteDatabase)]
      : getRecent({ cutoff, databaseFile: remoteDatabase });
  const toUpdate: { remoteFs: Filesystem; localFs?: Filesystem }[] = [];
  for (const fs of recent) {
    const remoteFs = get(fs, remoteDatabase);
    if (!filesystemExists(fs)) {
      toUpdate.push({ remoteFs });
    } else {
      const localFs = get(fs);
      if (remoteFs.archived != localFs.archived) {
        // different archive state, so needs an update to resolve this (either way)
        toUpdate.push({ remoteFs, localFs });
        continue;
      }
      if (deleteSnapshots) {
        // sync if *any* snapshots differ
        if (!isEqual(remoteFs.snapshots, localFs.snapshots)) {
          toUpdate.push({ remoteFs, localFs });
        }
      } else {
        // only sync if newest snapshots are different
        const newestRemoteSnapshot =
          remoteFs.snapshots[remoteFs.snapshots.length - 1];
        if (!newestRemoteSnapshot) {
          // no snapshots yet, so nothing to do.
          continue;
        }
        const newestLocalSnapshot =
          localFs.snapshots[localFs.snapshots.length - 1];
        if (
          !newestLocalSnapshot ||
          newestRemoteSnapshot > newestLocalSnapshot
        ) {
          toUpdate.push({ remoteFs, localFs });
        }
      }
    }
  }

  logger.debug(`pull: toUpdate.length = ${toUpdate.length}`);
  if (!dryRun) {
    for (const x of toUpdate) {
      logger.debug("pull: updating ", x);
      await pullOne({ ...x, remote, deleteSnapshots });
    }
  }

  const toDelete: RawFilesystem[] = [];
  if (deleteFilesystemCutoff) {
    for (const fs of getRecent({ cutoff })) {
      if (!filesystemExists(fs, remoteDatabase)) {
        if (new Date(fs.last_edited ?? 0) <= deleteFilesystemCutoff) {
          // it's old enough to delete:
          toDelete.push(fs);
        }
      }
    }
  }
  logger.debug(`pull: toDelete.length = ${toDelete.length}`);
  if (!dryRun) {
    for (const fs of toDelete) {
      logger.debug("pull: deleting", fs);
      await deleteFilesystem(fs);
    }
  }

  return { toUpdate, toDelete };
}

async function pullOne({
  remoteFs,
  localFs,
  remote,
  deleteSnapshots,
}: {
  remoteFs: Filesystem;
  localFs?: Filesystem;
  remote?: string;
  deleteSnapshots?: boolean;
}) {
  logger.debug("pull:", { remoteFs, localFs, remote, deleteSnapshots });
  if (localFs == null) {
    localFs = await createFilesystem(remoteFs);
  }

  // sync last_edited, affinity and nfs fields in all cases
  set({
    ...primaryKey(localFs),
    last_edited: remoteFs.last_edited,
    affinity: remoteFs.affinity,
    nfs: remoteFs.nfs,
  });

  if (localFs.archived && !remoteFs.archived) {
    // it's back in use:
    await dearchiveFilesystem(localFs);
    // don't return -- will then possibly sync more below, in case of new changes
  } else if (!localFs.archived && remoteFs.archived) {
    // we just archive ours. Note in theory there is a chance
    // that our local version is not update-to-date with the remote
    // version. However, the point of archiving is it should only happen
    // many weeks after a filesystem stopped being used, and by that
    // point we should have already pull'd the latest version.
    // Don't bother worrying about deleting snapshots.
    await archiveFilesystem(localFs);
    return;
  }
  if (localFs.archived && remoteFs.archived) {
    // nothing to do
    // Also, don't bother worrying about deleting snapshots, since can't.
    return;
  }
  const snapshot = newestCommonSnapshot(localFs.snapshots, remoteFs.snapshots);
  const newest_snapshot = remoteFs.snapshots[remoteFs.snapshots.length - 1];
  if (!newest_snapshot || snapshot == newest_snapshot) {
    logger.debug("pull: already have the newest snapshot locally");
  } else {
    const mountpoint = filesystemMountpoint(localFs);
    try {
      if (!snapshot) {
        // full replication with nothing local
        await exec({
          verbose: true,
          command: `ssh ${remote} "zfs send -e -c -R ${filesystemDataset(remoteFs)}@${newest_snapshot}" | sudo zfs recv -o mountpoint=${mountpoint} -F ${filesystemDataset(localFs)}`,
          what: {
            ...localFs,
            desc: "pull: doing a full receive from remote",
          },
        });
      } else {
        // incremental based on the last common snapshot
        const force =
          localFs.snapshots[localFs.snapshots.length - 1] == snapshot
            ? ""
            : " -F ";
        await exec({
          verbose: true,
          command: `ssh ${remote} "zfs send -e -c -I @${snapshot} ${filesystemDataset(remoteFs)}@${newest_snapshot}" | sudo zfs recv  -o mountpoint=${mountpoint} -F ${filesystemDataset(localFs)} ${force}`,
          what: {
            ...localFs,
            desc: "pull: doing an incremental replication from remote",
          },
        });
      }
    } finally {
      // even if there was an error, update local snapshots, since we likely have some new
      // ones (e.g., even if there was a partial receive, interrupted by a network drop).
      await getSnapshots(localFs);
    }
  }

  if (deleteSnapshots) {
    // In general due to snapshot trimming, the
    // list of snapshots on local might NOT match remote, but after replication
    // local will always have a *supserset* of remote.  We thus may have to
    // trim some snapshots:
    const remoteSnapshots = new Set(remoteFs.snapshots);
    const localSnapshots = get(localFs).snapshots;
    for (const snapshot of localSnapshots) {
      if (!remoteSnapshots.has(snapshot)) {
        await deleteSnapshot({ ...localFs, snapshot });
      }
    }
  }
}

// s0 and s1 are sorted oldest-to-newest lists of names of snapshots.
// return largest that is in common between the two or undefined if nothing is in common
function newestCommonSnapshot(s0: string[], s1: string[]) {
  const t1 = new Set(s1);
  for (let i = s0.length - 1; i >= 0; i--) {
    if (t1.has(s0[i])) {
      return s0[i];
    }
  }
}
