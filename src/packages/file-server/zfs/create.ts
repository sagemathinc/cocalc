/*

DEVELOPMENT:

If you're using Docker, make sure the DATA directory in config.ts is inside a folder
that is bind mounted from the host.

Start node.

a = require('@cocalc/file-server/zfs/create')

fs = await a.createFilesystem({namespace:'default', owner_type:'project', owner_id:'6b851643-360e-435e-b87e-f9a6ab64a8b1', name:'home'})

await a.deleteFilesystem({namespace:'default', owner_type:'project', owner_id:'6b851643-360e-435e-b87e-f9a6ab64a8b1', name:'home'})

*/

import { create, get, getDb, deleteFromDb, filesystemExists } from "./db";
import { exec } from "./util";
import {
  filesystemArchivePath,
  bupFilesystemMountpoint,
  filesystemDataset,
  filesystemMountpoint,
  poolName,
} from "./names";
import { initializePool } from "./pools";
import { dearchiveFilesystem } from "./archive";
import { UID, GID } from "./config";
import { createSnapshot } from "./snapshots";
import { type Filesystem, primaryKey, type PrimaryKey } from "./types";

export async function createFilesystem(
  opts: PrimaryKey & {
    affinity?: string;
    clone?: PrimaryKey;
  },
): Promise<Filesystem> {
  if (filesystemExists(opts)) {
    return get(opts);
  }
  const pk = primaryKey(opts);
  const { namespace } = pk;
  const { affinity, clone } = opts;
  const source = clone ? get(clone) : undefined;

  const db = getDb();
  // select a pool:
  let pool: undefined | string = undefined;

  if (source != null) {
    // For clone, we use same pool as source filesystem.  (we could use zfs send/recv but that's much slower and not a clone)
    pool = source.pool;
  } else {
    if (affinity) {
      // if affinity is set, have preference to use same pool as other filesystems with this affinity.
      const x = db
        .prepare(
          "SELECT pool, COUNT(pool) AS cnt FROM filesystems WHERE namespace=? AND affinity=? ORDER by cnt DESC",
        )
        .get(namespace, affinity) as { pool: string; cnt: number } | undefined;
      pool = x?.pool;
    }
    if (!pool) {
      // create new pool
      pool = poolName(pk);
    }
  }
  if (!pool) {
    throw Error("bug -- unable to select a pool");
  }

  const { cnt } = db
    .prepare(
      "SELECT COUNT(pool) AS cnt FROM filesystems WHERE pool=? AND namespace=?",
    )
    .get(pool, namespace) as { cnt: number };

  if (cnt == 0) {
    // initialize pool for use in this namespace:
    await initializePool({ pool, namespace });
  }

  if (source == null) {
    // create filesystem on the selected pool
    const mountpoint = filesystemMountpoint(pk);
    const dataset = filesystemDataset({ ...pk, pool });
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
        dataset,
      ],
      what: {
        ...pk,
        desc: `create filesystem ${dataset} for filesystem on the selected pool mounted at ${mountpoint}`,
      },
    });
    await exec({
      verbose: true,
      command: "sudo",
      args: ["chown", "-R", `${UID}:${GID}`, mountpoint],
      whate: {
        ...pk,
        desc: `setting permissions of filesystem mounted at ${mountpoint}`,
      },
    });
  } else {
    // clone source
    // First ensure filesystem isn't archived
    // (we might alternatively de-archive to make the clone...?)
    if (source.archived) {
      await dearchiveFilesystem(source);
    }
    // Get newest snapshot, or make one if there are none
    const snapshot = await createSnapshot({ ...source, ifChanged: true });
    if (!snapshot) {
      throw Error("bug -- source should have snapshot");
    }
    const source_snapshot = `${filesystemDataset(source)}@${snapshot}`;
    await exec({
      verbose: true,
      command: "sudo",
      args: [
        "zfs",
        "clone",
        "-o",
        `mountpoint=${filesystemMountpoint(pk)}`,
        "-o",
        "compression=lz4",
        "-o",
        "dedup=on",
        source_snapshot,
        filesystemDataset({ ...pk, pool }),
      ],
      what: {
        ...pk,
        desc: `clone filesystem from ${source_snapshot}`,
      },
    });
  }

  // update database
  create({ ...pk, pool, affinity });
  return get(pk);
}

// delete -- This is very dangerous -- it deletes the filesystem,
// the archive, and any backups and removes knowledge the filesystem from the db.

export async function deleteFilesystem(fs: PrimaryKey) {
  const filesystem = get(fs);
  const dataset = filesystemDataset(filesystem);
  if (!filesystem.archived) {
    await exec({
      verbose: true,
      command: "sudo",
      args: ["zfs", "destroy", "-r", dataset],
      what: {
        ...filesystem,
        desc: `destroy dataset ${dataset} containing the filesystem`,
      },
    });
  }
  await exec({
    verbose: true,
    command: "sudo",
    args: ["rm", "-rf", filesystemMountpoint(filesystem)],
    what: {
      ...filesystem,
      desc: `delete directory '${filesystemMountpoint(filesystem)}' where filesystem was stored`,
    },
  });
  await exec({
    verbose: true,
    command: "sudo",
    args: ["rm", "-rf", bupFilesystemMountpoint(filesystem)],
    what: {
      ...filesystem,
      desc: `delete directory '${bupFilesystemMountpoint(filesystem)}' where backups were stored`,
    },
  });
  await exec({
    verbose: true,
    command: "sudo",
    args: ["rm", "-rf", filesystemArchivePath(filesystem)],
    what: {
      ...filesystem,
      desc: `delete directory '${filesystemArchivePath(filesystem)}' where archives were stored`,
    },
  });
  deleteFromDb(filesystem);
}
