/*


*/

import { create, get, getDb, deleteFromDb, filesystemExists } from "./db";
import { exec } from "./util";
import {
  filesystemArchivePath,
  bupFilesystemMountpoint,
  filesystemDataset,
  filesystemPool,
  filesystemMountpoint,
  filesystemImagePath,
} from "./names";
import { getPools, initializePool } from "./pools";
import { dearchiveFilesystem } from "./archive";
import { UID, GID } from "./config";
import { createSnapshot } from "./snapshots";
import { type Filesystem, primaryKey, type PrimaryKey } from "./types";

const MAX_POOL_SIZE = "128G";

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

  if (source == null) {
    // create filesystem
    const imagePath = filesystemImagePath(pk);
    await exec({
      verbose: true,
      command: "sudo",
      args: ["mkdir", "-p", imagePath],
    });
    const image = join(imagePath, "0.img");
    await exec({
      verbose: true,
      command: "sudo",
      args: ["truncate", "-s", MAX_POOL_SIZE, image],
      what: { ...pk, desc: "create sparse image file" },
    });
    const mountpoint = filesystemMountpoint(pk);
    const pool = filesystemPool(pk);
    const dataset = filesystemDataset(pk);

    // create the pool
    await exec({
      verbose: true,
      command: "sudo",
      args: [
        "zpool",
        "create",
        "-o",
        "feature@fast_dedup=enabled",
        "-m",
        "none",
        pool,
        image,
      ],
      what: {
        ...pk,
        desc: `create the zpool ${pool} using the device ${image}`,
      },
    });

    // create the filesystem
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
  create({ ...pk, affinity });
  return get(pk);
}

// delete -- This is very dangerous -- it deletes the filesystem,
// the archive, and any backups and removes knowledge the filesystem from the db.

// TODO: WHAT ABOUT CLONES.

export async function deleteFilesystem(fs: PrimaryKey) {
  const filesystem = get(fs);
  const dataset = filesystemDataset(filesystem);
  const pool = filesystemPool(filesystem);
  if (!filesystem.archived) {
    await exec({
      verbose: true,
      command: "sudo",
      args: ["zpool", "destroy", pool],
      what: {
        ...filesystem,
        desc: `destroy pool ${dataset} containing the filesystem`,
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
