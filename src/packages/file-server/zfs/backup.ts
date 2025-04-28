/*
Make backups using bup.
*/

import { bupFilesystemMountpoint, filesystemSnapshotMountpoint } from "./names";
import { get, getRecent, set } from "./db";
import { exec } from "./util";
import getLogger from "@cocalc/backend/logger";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { join } from "path";
import { mountFilesystem } from "./properties";
import { split } from "@cocalc/util/misc";
import { BUP_INTERVAL_MS } from "./config";
import { primaryKey, type PrimaryKey } from "./types";
import { createSnapshot } from "./snapshots";

const logger = getLogger("file-server:zfs:backup");

const EXCLUDES = [".conda", ".npm", "cache", ".julia", ".local/share/pnpm"];

export async function createBackup(
  fs: PrimaryKey,
): Promise<{ BUP_DIR: string }> {
  const pk = primaryKey(fs);
  logger.debug("createBackup", pk);
  const filesystem = get(pk);
  await mountFilesystem(pk);
  const snapshot = await createSnapshot({ ...filesystem, ifChanged: true });
  const mountpoint = filesystemSnapshotMountpoint({ ...filesystem, snapshot });
  const excludes: string[] = [];
  for (const path of EXCLUDES) {
    excludes.push("--exclude");
    excludes.push(join(mountpoint, path));
  }
  logger.debug("createBackup: index", pk);
  const BUP_DIR = bupFilesystemMountpoint(filesystem);
  if (!(await exists(BUP_DIR))) {
    await exec({
      verbose: true,
      command: "sudo",
      args: ["mkdir", "-p", BUP_DIR],
      what: { ...pk, desc: "make bup repo" },
    });
    await exec({
      verbose: true,
      command: "sudo",
      args: ["bup", "-d", BUP_DIR, "init"],
      what: { ...pk, desc: "bup init" },
    });
  }
  await exec({
    verbose: true,
    env: { BUP_DIR },
    command: "sudo",
    args: [
      "--preserve-env",
      "bup",
      "index",
      ...excludes,
      "-x",
      mountpoint,
      "--no-check-device",
    ],
    what: { ...pk, desc: "creating bup index" },
  });
  logger.debug("createBackup: save", pk);
  await exec({
    verbose: true,
    env: { BUP_DIR },
    command: "sudo",
    args: [
      "--preserve-env",
      "bup",
      "save",
      "-q",
      "--strip",
      "-n",
      "master",
      mountpoint,
    ],
    what: { ...pk, desc: "save new bup snapshot" },
  });

  const { stdout } = await exec({
    env: { BUP_DIR },
    command: "sudo",
    args: ["--preserve-env", "bup", "ls", "master"],
    what: { ...pk, desc: "getting name of backup" },
  });
  const v = split(stdout);
  const last_bup_backup = v[v.length - 2];
  logger.debug("createBackup: created ", { last_bup_backup });
  set({ ...pk, last_bup_backup });

  // prune-older --unsafe --keep-all-for 8d --keep-dailies-for 4w --keep-monthlies-for 6m --keep-yearlies-for 10y
  logger.debug("createBackup: prune", pk);
  await exec({
    verbose: true,
    env: { BUP_DIR },
    command: "sudo",
    args: [
      "--preserve-env",
      "bup",
      "prune-older",
      "--unsafe",
      "--keep-all-for",
      "8d",
      "--keep-dailies-for",
      "4w",
      "--keep-monthlies-for",
      "6m",
      "--keep-yearlies-for",
      "5y",
    ],
    what: { ...pk, desc: "save new bup snapshot" },
  });

  return { BUP_DIR };
}

// Go through ALL filesystems with last_edited >= cutoff and make a bup
// backup if they are due.
// cutoff = a Date (default = 1 week ago)
export async function maintainBackups(cutoff?: Date) {
  logger.debug("backupActiveFilesystems: getting...");
  const v = getRecent({ cutoff });
  logger.debug(
    `backupActiveFilesystems: considering ${v.length} filesystems`,
    cutoff,
  );
  let i = 0;
  for (const { archived, last_edited, last_bup_backup, ...pk } of v) {
    if (archived || !last_edited) {
      continue;
    }
    const age =
      new Date(last_edited).valueOf() - bupToDate(last_bup_backup).valueOf();
    if (age < BUP_INTERVAL_MS) {
      // there's a new backup already
      continue;
    }
    try {
      await createBackup(pk);
    } catch (err) {
      logger.debug(`backupActiveFilesystems: error -- ${err}`);
    }
    i += 1;
    if (i % 10 == 0) {
      logger.debug(`backupActiveFilesystems: ${i}/${v.length}`);
    }
  }
}

function bupToDate(dateString?: string): Date {
  if (!dateString) {
    return new Date(0);
  }
  // Extract components using regular expression
  const match = dateString.match(
    /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})$/,
  );

  if (match) {
    const [_, year, month, day, hour, minute, second] = match; // Destructure components
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second),
    );
  } else {
    throw Error("Invalid bup date format");
  }
}
