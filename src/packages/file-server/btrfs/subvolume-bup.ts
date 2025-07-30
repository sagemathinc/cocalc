/*

BUP Architecture:

There is a single global dedup'd backup archive stored in the btrfs filesystem.
Obviously, admins should rsync this regularly to a separate location as a genuine
backup strategy.

NOTE: we use bup instead of btrfs send/recv !

Not used.  Instead we will rely on bup (and snapshots of the underlying disk) for backups, since:
 - much easier to check they are valid
 - decoupled from any btrfs issues
 - not tied to any specific filesystem at all
 - easier to offsite via incremental rsync
 - much more space efficient with *global* dedup and compression
 - bup is really just git, which is much more proven than even btrfs

The drawback is speed, but that can be managed.
*/

import { type DirectoryListingEntry } from "@cocalc/util/types";
import { type Subvolume } from "./subvolume";
import { sudo, parseBupTime } from "./util";
import { join, normalize } from "path";
import getLogger from "@cocalc/backend/logger";

const BUP_SNAPSHOT = "temp-bup-snapshot";

const logger = getLogger("file-server:btrfs:subvolume-bup");

export class SubvolumeBup {
  constructor(private subvolume: Subvolume) {}

  // create a new bup backup
  save = async ({
    // timeout used for bup index and bup save commands
    timeout = 30 * 60 * 1000,
  }: { timeout?: number } = {}) => {
    if (await this.subvolume.snapshots.exists(BUP_SNAPSHOT)) {
      logger.debug(`createBupBackup: deleting existing ${BUP_SNAPSHOT}`);
      await this.subvolume.snapshots.delete(BUP_SNAPSHOT);
    }
    try {
      logger.debug(
        `createBackup: creating ${BUP_SNAPSHOT} to get a consistent backup`,
      );
      await this.subvolume.snapshots.create(BUP_SNAPSHOT);
      const target = await this.subvolume.fs.safeAbsPath(
        this.subvolume.snapshots.path(BUP_SNAPSHOT),
      );

      logger.debug(`createBupBackup: indexing ${BUP_SNAPSHOT}`);
      await sudo({
        command: "bup",
        args: [
          "-d",
          this.subvolume.filesystem.bup,
          "index",
          "--exclude",
          join(target, ".snapshots"),
          "-x",
          target,
        ],
        timeout,
      });

      logger.debug(`createBackup: saving ${BUP_SNAPSHOT}`);
      await sudo({
        command: "bup",
        args: [
          "-d",
          this.subvolume.filesystem.bup,
          "save",
          "--strip",
          "-n",
          this.subvolume.name,
          target,
        ],
        timeout,
      });
    } finally {
      logger.debug(`createBupBackup: deleting temporary ${BUP_SNAPSHOT}`);
      await this.subvolume.snapshots.delete(BUP_SNAPSHOT);
    }
  };

  restore = async (path: string) => {
    // path -- branch/revision/path/to/dir
    if (path.startsWith("/")) {
      path = path.slice(1);
    }
    path = normalize(path);
    // ... but to avoid potential data loss, we make a snapshot before deleting it.
    await this.subvolume.snapshots.create();
    const i = path.indexOf("/"); // remove the commit name
    // remove the target we're about to restore
    await this.subvolume.fs.rm(path.slice(i + 1), { recursive: true });
    await sudo({
      command: "bup",
      args: [
        "-d",
        this.subvolume.filesystem.bup,
        "restore",
        "-C",
        this.subvolume.path,
        join(`/${this.subvolume.name}`, path),
        "--quiet",
      ],
    });
  };

  // [ ] TODO: remove this ls and instead rely only on the fs sandbox code.
  ls = async (path: string = ""): Promise<DirectoryListingEntry[]> => {
    if (!path) {
      const { stdout } = await sudo({
        command: "bup",
        args: ["-d", this.subvolume.filesystem.bup, "ls", this.subvolume.name],
      });
      const v: DirectoryListingEntry[] = [];
      let newest = 0;
      for (const x of stdout.trim().split("\n")) {
        const name = x.split(" ").slice(-1)[0];
        if (name == "latest") {
          continue;
        }
        const mtime = parseBupTime(name).valueOf() / 1000;
        newest = Math.max(mtime, newest);
        v.push({ name, isDir: true, mtime });
      }
      if (v.length > 0) {
        v.push({ name: "latest", isDir: true, mtime: newest });
      }
      return v;
    }

    path = (await this.subvolume.fs.safeAbsPath(path)).slice(
      this.subvolume.path.length,
    );
    const { stdout } = await sudo({
      command: "bup",
      args: [
        "-d",
        this.subvolume.filesystem.bup,
        "ls",
        "--almost-all",
        "--file-type",
        "-l",
        join(`/${this.subvolume.name}`, path),
      ],
    });
    const v: DirectoryListingEntry[] = [];
    for (const x of stdout.split("\n")) {
      // [-rw-------","6b851643360e435eb87ef9a6ab64a8b1/6b851643360e435eb87ef9a6ab64a8b1","5","2025-07-15","06:12","a.txt"]
      const w = x.split(/\s+/);
      if (w.length >= 6) {
        let isDir, name;
        if (w[5].endsWith("@") || w[5].endsWith("=") || w[5].endsWith("|")) {
          w[5] = w[5].slice(0, -1);
        }
        if (w[5].endsWith("/")) {
          isDir = true;
          name = w[5].slice(0, -1);
        } else {
          name = w[5];
          isDir = false;
        }
        const size = parseInt(w[2]);
        const mtime = new Date(w[3] + "T" + w[4]).valueOf() / 1000;
        v.push({ name, size, mtime, isDir });
      }
    }
    return v;
  };

  prune = async ({
    dailies = "1w",
    monthlies = "4m",
    all = "3d",
  }: { dailies?: string; monthlies?: string; all?: string } = {}) => {
    await sudo({
      command: "bup",
      args: [
        "-d",
        this.subvolume.filesystem.bup,
        "prune-older",
        `--keep-dailies-for=${dailies}`,
        `--keep-monthlies-for=${monthlies}`,
        `--keep-all-for=${all}`,
        "--unsafe",
        this.subvolume.name,
      ],
    });
  };
}
