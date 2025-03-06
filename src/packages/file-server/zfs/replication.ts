/*
Use zfs replication over ssh to replicate one file-server to another one,
primarily for backup purpose.
*/

import { type Filesystem, type RawFilesystem } from "./types";
import { exec } from "./util";
import { databaseFilename, filesystemDataset } from "./names";
import { filesystemExists, getRecent, get } from "./db";
import getLogger from "@cocalc/backend/logger";
import { getSnapshots } from "./snapshots";
import { createFilesystem, deleteFilesystem } from "./create";
import { DATA } from "./config";
import { archiveFilesystem, dearchiveFilesystem } from "./archive";

const logger = getLogger("file-server:zfs:sync");

interface Remote {
  // remote = user@hostname that you can ssh to
  remote: string;
  // filesystem prefix of the remote server, so ${prefix}/database.sqlite3 has the
  // database that defines the state of the remote server.
  prefix: string;
}

// Copy from remote to here every filesystem that has changed since cutoff.
export async function pullAll({
  remote,
  prefix,
  cutoff,
  deleteLocal,
  dryRun,
}: Remote & {
  cutoff?: Date;
  // DANGER: if true, any local filesystems modified after cutoff
  // that are not on the remote get deleted locally
  deleteLocal?: boolean;
  // just say how much will happen, but don't do anything.
  dryRun?: boolean;
}) {
  if (cutoff == null) {
    cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  }
  logger.debug("sync: get the remote sqlite datbase");
  const remoteDatabase = `${DATA}/remote.sqlite3`;
  await exec({
    command: "scp",
    args: [`${remote}:${databaseFilename(prefix)}`, remoteDatabase],
  });

  logger.debug("sync: compare state");
  const recent = getRecent({ cutoff, databaseFile: remoteDatabase });
  const toUpdate: { remoteFs: Filesystem; localFs?: Filesystem }[] = [];
  for (const fs of recent) {
    const remoteFs = get(fs, remoteDatabase);
    if (!filesystemExists(fs)) {
      toUpdate.push({ remoteFs });
    } else {
      const localFs = get(fs);
      if (remoteFs.archived && !localFs.archived) {
        toUpdate.push({ remoteFs, localFs });
        continue;
      }
      const newestRemoteSnapshot =
        remoteFs.snapshots[remoteFs.snapshots.length - 1];
      if (!newestRemoteSnapshot) {
        // no snapshots yet, so nothing to do.
        continue;
      }
      const newestLocalSnapshot =
        localFs.snapshots[localFs.snapshots.length - 1];
      if (!newestLocalSnapshot || newestRemoteSnapshot > newestLocalSnapshot) {
        toUpdate.push({ remoteFs, localFs });
      }
    }
  }

  logger.debug(`sync: toUpdate.length = ${toUpdate.length}`);
  if (!dryRun) {
    for (const x of toUpdate) {
      logger.debug("sync: updating ", x);
      await pull({ ...x, remote });
    }
  }

  const toDelete: RawFilesystem[] = [];
  if (deleteLocal) {
    for (const fs of getRecent({ cutoff })) {
      if (!filesystemExists(fs, remoteDatabase)) {
        toDelete.push(fs);
      }
    }
  }
  logger.debug(`sync: toDelete.length = ${toDelete.length}`);
  if (!dryRun) {
    for (const fs of toDelete) {
      logger.debug("sync: deleting", fs);
      await deleteFilesystem(fs);
    }
  }
}

async function pull({
  remoteFs,
  localFs,
  remote,
}: {
  remoteFs: Filesystem;
  localFs?: Filesystem;
  remote?: string;
}) {
  logger.debug("pull:", { remoteFs, localFs, remote });
  if (localFs == null) {
    localFs = await createFilesystem(remoteFs);
  } else if (localFs.archived && !remoteFs.archived) {
    // it's back in use:
    await dearchiveFilesystem(localFs);
    // will then sync it below
  } else if (!localFs.archived && remoteFs.archived) {
    // we just archive ours. Note in theory there is a chance
    // that our local version is not update-to-date with the remote
    // version. However, the point of archiving is it should only happen
    // many weeks after a filesystem stopped being used, and by that
    // point we should have already pull'd the latest version.
    await archiveFilesystem(localFs);
    return;
  }
  if (localFs.archived && remoteFs.archived) {
    // nothing to do
    return;
  }
  const snapshot = newestCommonSnapshot(localFs.snapshots, remoteFs.snapshots);
  const newest_snapshot = remoteFs.snapshots[remoteFs.snapshots.length - 1];
  if (!newest_snapshot) {
    throw Error("remoteFs must have at least one snapshot");
  }
  try {
    if (!snapshot) {
      // full replication with nothing local
      await exec({
        verbose: true,
        command: `sudo sh -c 'ssh ${remote} "zfs send -e -c -R ${filesystemDataset(remoteFs)}@${newest_snapshot}" | sudo zfs recv ${filesystemDataset(localFs)}"'`,
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
        command: `sudo sh -c 'ssh ${remote} "zfs send -e -c -I @${snapshot} ${filesystemDataset(remoteFs)}@${newest_snapshot}" | sudo zfs recv ${filesystemDataset(localFs)}" ${force}'`,
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
