/*
A subvolume
*/

import { type Filesystem, DEFAULT_SUBVOLUME_SIZE } from "./filesystem";
import refCache from "@cocalc/util/refcache";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { exists, isdir, listdir, mkdirp, sudo } from "./util";
import { join, normalize } from "path";
import { updateRollingSnapshots, type SnapshotCounts } from "./snapshots";
import { DirectoryListingEntry } from "@cocalc/util/types";
import getListing from "@cocalc/backend/get-listing";
import getLogger from "@cocalc/backend/logger";

export const SNAPSHOTS = ".snapshots";
const SEND_SNAPSHOT_PREFIX = "send-";
const BUP_SNAPSHOT = "temp-bup-snapshot";
const PAD = 4;

const logger = getLogger("file-server:storage-btrfs:subvolume");

interface Options {
  filesystem: Filesystem;
  name: string;
}

export class Subvolume {
  public readonly name: string;

  private filesystem: Filesystem;
  private readonly path: string;
  private readonly snapshotsDir: string;

  constructor({ filesystem, name }: Options) {
    this.filesystem = filesystem;
    this.name = name;
    this.path = join(filesystem.opts.mount, name);
    this.snapshotsDir = join(this.path, SNAPSHOTS);
  }

  init = async () => {
    if (!(await exists(this.path))) {
      await sudo({
        command: "btrfs",
        args: ["subvolume", "create", this.path],
      });
      await this.makeSnapshotsDir();
      await this.chown(this.path);
      await this.size(
        this.filesystem.opts.defaultSize ?? DEFAULT_SUBVOLUME_SIZE,
      );
    }
  };

  close = () => {
    // @ts-ignore
    delete this.filesystem;
    // @ts-ignore
    delete this.name;
    // @ts-ignore
    delete this.path;
    // @ts-ignore
    delete this.snapshotsDir;
  };

  private chown = async (path: string) => {
    if (!this.filesystem.opts.uid) {
      return;
    }
    await sudo({
      command: "chown",
      args: [`${this.filesystem.opts.uid}:${this.filesystem.opts.uid}`, path],
    });
  };

  // this should provide a path that is guaranteed to be
  // inside this.path on the filesystem or throw error
  // [ ] TODO: not sure if the code here is sufficient!!
  private normalize = (path: string) => {
    return join(this.path, normalize(path));
  };

  /////////////
  // Files
  /////////////
  ls = async (
    path: string,
    { hidden, limit }: { hidden?: boolean; limit?: number } = {},
  ): Promise<DirectoryListingEntry[]> => {
    path = normalize(path);
    return await getListing(this.normalize(path), hidden, {
      limit,
      home: "/",
    });
  };

  readFile = async (path: string, encoding?: any): Promise<string | Buffer> => {
    path = normalize(path);
    return await readFile(this.normalize(path), encoding);
  };

  writeFile = async (path: string, data: string | Buffer) => {
    path = normalize(path);
    return await writeFile(this.normalize(path), data);
  };

  unlink = async (path: string) => {
    await unlink(this.normalize(path));
  };

  rsync = async ({
    src,
    target,
    args = ["-axH"],
    timeout = 5 * 60 * 1000,
  }: {
    src: string;
    target: string;
    args?: string[];
    timeout?: number;
  }): Promise<{ stdout: string; stderr: string; exit_code: number }> => {
    let srcPath = this.normalize(src);
    let targetPath = this.normalize(target);
    if (!srcPath.endsWith("/") && (await isdir(srcPath))) {
      srcPath += "/";
      if (!targetPath.endsWith("/")) {
        targetPath += "/";
      }
    }
    return await sudo({
      command: "rsync",
      args: [...args, srcPath, targetPath],
      err_on_exit: false,
      timeout: timeout / 1000,
    });
  };

  /////////////
  // QUOTA
  /////////////

  private quotaInfo = async () => {
    const { stdout } = await sudo({
      verbose: false,
      command: "btrfs",
      args: ["--format=json", "qgroup", "show", "-reF", this.path],
    });
    const x = JSON.parse(stdout);
    return x["qgroup-show"][0];
  };

  quota = async (): Promise<{
    size: number;
    used: number;
  }> => {
    let { max_referenced: size, referenced: used } = await this.quotaInfo();
    if (size == "none") {
      size = null;
    }
    return {
      used,
      size,
    };
  };

  size = async (size: string | number) => {
    if (!size) {
      throw Error("size must be specified");
    }
    await sudo({
      command: "btrfs",
      args: ["qgroup", "limit", `${size}`, this.path],
    });
  };

  du = async () => {
    return await sudo({
      command: "btrfs",
      args: ["filesystem", "du", "-s", this.path],
    });
  };

  usage = async (): Promise<{
    // used and free in bytes
    used: number;
    free: number;
    size: number;
  }> => {
    const { stdout } = await sudo({
      command: "btrfs",
      args: ["filesystem", "usage", "-b", this.path],
    });
    let used: number = -1;
    let free: number = -1;
    let size: number = -1;
    for (const x of stdout.split("\n")) {
      if (used == -1) {
        const i = x.indexOf("Used:");
        if (i != -1) {
          used = parseInt(x.split(":")[1].trim());
          continue;
        }
      }
      if (free == -1) {
        const i = x.indexOf("Free (statfs, df):");
        if (i != -1) {
          free = parseInt(x.split(":")[1].trim());
          continue;
        }
      }
      if (size == -1) {
        const i = x.indexOf("Device size:");
        if (i != -1) {
          size = parseInt(x.split(":")[1].trim());
          continue;
        }
      }
    }
    return { used, free, size };
  };

  /////////////
  // SNAPSHOTS
  /////////////
  snapshotPath = (snapshot: string, ...segments) => {
    return join(SNAPSHOTS, snapshot, ...segments);
  };

  private makeSnapshotsDir = async () => {
    if (await exists(this.snapshotsDir)) {
      return;
    }
    await mkdirp([this.snapshotsDir]);
    await this.chown(this.snapshotsDir);
    await sudo({ command: "chmod", args: ["a-w", this.snapshotsDir] });
  };

  createSnapshot = async (name?: string) => {
    name ??= new Date().toISOString();
    logger.debug("createSnapshot", { name, subvolume: this.name });
    await this.makeSnapshotsDir();
    await sudo({
      command: "btrfs",
      args: [
        "subvolume",
        "snapshot",
        "-r",
        this.path,
        join(this.snapshotsDir, name),
      ],
    });
  };

  snapshots = async (): Promise<string[]> => {
    return (await listdir(this.snapshotsDir)).sort();
  };

  lockSnapshot = async (name) => {
    if (await exists(join(this.snapshotsDir, name))) {
      await sudo({
        command: "touch",
        args: [join(this.snapshotsDir, `.${name}.lock`)],
      });
    } else {
      throw Error(`snapshot ${name} does not exist`);
    }
  };

  unlockSnapshot = async (name) => {
    await sudo({
      command: "rm",
      args: ["-f", join(this.snapshotsDir, `.${name}.lock`)],
    });
  };

  snapshotExists = async (name: string) => {
    return await exists(join(this.snapshotsDir, name));
  };

  deleteSnapshot = async (name) => {
    if (await exists(join(this.snapshotsDir, `.${name}.lock`))) {
      throw Error(`snapshot ${name} is locked`);
    }
    await sudo({
      command: "btrfs",
      args: ["subvolume", "delete", join(this.snapshotsDir, name)],
    });
  };

  updateRollingSnapshots = async (counts?: Partial<SnapshotCounts>) => {
    return await updateRollingSnapshots({ subvolume: this, counts });
  };

  // has newly written changes since last snapshot
  hasUnsavedChanges = async (): Promise<boolean> => {
    const s = await this.snapshots();
    if (s.length == 0) {
      // more than just the SNAPSHOTS directory?
      const v = await listdir(this.path);
      if (v.length == 0 || (v.length == 1 && v[0] == this.snapshotsDir)) {
        return false;
      }
      return true;
    }
    const pathGen = await getGeneration(this.path);
    const snapGen = await getGeneration(
      join(this.snapshotsDir, s[s.length - 1]),
    );
    return snapGen < pathGen;
  };

  /////////////
  // BACKUPS
  // There is a single global dedup'd backup archive stored in the btrfs filesystem.
  // Obviously, admins should rsync this regularly to a separate location as a genuine
  // backup strategy.
  /////////////

  // create a new bup backup
  createBupBackup = async ({
    // timeout used for bup index and bup save commands
    timeout = 30 * 60 * 1000,
  }: { timeout?: number } = {}) => {
    if (await this.snapshotExists(BUP_SNAPSHOT)) {
      logger.debug(`createBupBackup: deleting existing ${BUP_SNAPSHOT}`);
      await this.deleteSnapshot(BUP_SNAPSHOT);
    }
    try {
      logger.debug(
        `createBupBackup: creating ${BUP_SNAPSHOT} to get a consistent backup`,
      );
      await this.createSnapshot(BUP_SNAPSHOT);
      const target = join(this.snapshotsDir, BUP_SNAPSHOT);
      logger.debug(`createBupBackup: indexing ${BUP_SNAPSHOT}`);
      await sudo({
        command: "bup",
        args: [
          "-d",
          this.filesystem.bup,
          "index",
          "--exclude",
          join(target, ".snapshots"),
          "-x",
          target,
        ],
        timeout,
      });
      logger.debug(`createBupBackup: saving ${BUP_SNAPSHOT}`);
      await sudo({
        command: "bup",
        args: [
          "-d",
          this.filesystem.bup,
          "save",
          "--strip",
          "-n",
          this.name,
          target,
        ],
        timeout,
      });
    } finally {
      logger.debug(`createBupBackup: deleting temporary ${BUP_SNAPSHOT}`);
      await this.deleteSnapshot(BUP_SNAPSHOT);
    }
  };

  bupBackups = async (): Promise<string[]> => {
    const { stdout } = await sudo({
      command: "bup",
      args: ["-d", this.filesystem.bup, "ls", this.name],
    });
    return stdout
      .split("\n")
      .map((x) => x.split(" ").slice(-1)[0])
      .filter((x) => x);
  };

  bupRestore = async (path: string) => {
    // path -- branch/revision/path/to/dir
    if (path.startsWith("/")) {
      path = path.slice(1);
    }
    path = normalize(path);
    // ... but to avoid potential data loss, we make a snapshot before deleting it.
    await this.createSnapshot();
    const i = path.indexOf("/"); // remove the commit name
    await sudo({
      command: "rm",
      args: ["-rf", this.normalize(path.slice(i + 1))],
    });
    await sudo({
      command: "bup",
      args: [
        "-d",
        this.filesystem.bup,
        "restore",
        "-C",
        this.path,
        join(`/${this.name}`, path),
        "--quiet",
      ],
    });
  };

  bupLs = async (path: string): Promise<DirectoryListingEntry[]> => {
    path = normalize(path);
    const { stdout } = await sudo({
      command: "bup",
      args: [
        "-d",
        this.filesystem.bup,
        "ls",
        "--almost-all",
        "--file-type",
        "-l",
        join(`/${this.name}`, path),
      ],
    });
    const v: DirectoryListingEntry[] = [];
    for (const x of stdout.split("\n")) {
      // [-rw-------","6b851643360e435eb87ef9a6ab64a8b1/6b851643360e435eb87ef9a6ab64a8b1","5","2025-07-15","06:12","a.txt"]
      const w = x.split(/\s+/);
      if (w.length >= 6) {
        let isdir, name;
        if (w[5].endsWith("@") || w[5].endsWith("=") || w[5].endsWith("|")) {
          w[5] = w[5].slice(0, -1);
        }
        if (w[5].endsWith("/")) {
          isdir = true;
          name = w[5].slice(0, -1);
        } else {
          name = w[5];
          isdir = false;
        }
        const size = parseInt(w[2]);
        const mtime = new Date(w[3] + "T" + w[4]).valueOf() / 1000;
        v.push({ name, size, mtime, isdir });
      }
    }
    return v;
  };

  bupPrune = async ({
    dailies = "1w",
    monthlies = "4m",
    all = "3d",
  }: { dailies?: string; monthlies?: string; all?: string } = {}) => {
    await sudo({
      command: "bup",
      args: [
        "-d",
        this.filesystem.bup,
        "prune-older",
        `--keep-dailies-for=${dailies}`,
        `--keep-monthlies-for=${monthlies}`,
        `--keep-all-for=${all}`,
        "--unsafe",
        this.name,
      ],
    });
  };

  /////////////
  // BTRFS send/recv
  // Not used.  Instead we will rely on bup (and snapshots of the underlying disk) for backups, since:
  //  - much easier to check they are valid
  //  - decoupled from any btrfs issues
  //  - not tied to any specific filesystem at all
  //  - easier to offsite via incremntal rsync
  //  - much more space efficient with *global* dedup and compression
  //  - bup is really just git, which is very proven
  // The drawback is speed.
  /////////////

  // this was just a quick proof of concept -- I don't like it.  Should switch to using
  // timestamps and a lock.
  // To recover these, doing recv for each in order does work.  Then you have to
  // snapshot all of the results to move them.  It's awkward, but efficient
  // and works fine.
  send = async () => {
    await mkdirp([join(this.filesystem.streams, this.name)]);
    const streams = new Set(
      await listdir(join(this.filesystem.streams, this.name)),
    );
    const allSnapshots = await this.snapshots();
    const snapshots = allSnapshots.filter(
      (x) => x.startsWith(SEND_SNAPSHOT_PREFIX) && streams.has(x),
    );
    const nums = snapshots.map((x) =>
      parseInt(x.slice(SEND_SNAPSHOT_PREFIX.length)),
    );
    nums.sort();
    const last = nums.slice(-1)[0];
    let seq, parent;
    if (last) {
      seq = `${last + 1}`.padStart(PAD, "0");
      const l = `${last}`.padStart(PAD, "0");
      parent = `${SEND_SNAPSHOT_PREFIX}${l}`;
    } else {
      seq = "1".padStart(PAD, "0");
      parent = "";
    }
    const send = `${SEND_SNAPSHOT_PREFIX}${seq}`;
    if (allSnapshots.includes(send)) {
      await this.deleteSnapshot(send);
    }
    await this.createSnapshot(send);
    await sudo({
      command: "btrfs",
      args: [
        "send",
        "--compressed-data",
        join(this.snapshotsDir, send),
        ...(last ? ["-p", join(this.snapshotsDir, parent)] : []),
        "-f",
        join(this.filesystem.streams, this.name, send),
      ],
    });
    if (parent) {
      await this.deleteSnapshot(parent);
    }
  };

  //   recv = async (target: string) => {
  //     const streamsDir = join(this.filesystem.streams, this.name);
  //     const streams = await listdir(streamsDir);
  //     streams.sort();
  //     for (const stream of streams) {
  //       await sudo({
  //         command: "btrfs",
  //         args: ["recv", "-f", join(streamsDir, stream)],
  //       });
  //     }
  //   };
}

async function getGeneration(path: string): Promise<number> {
  const { stdout } = await sudo({
    command: "btrfs",
    args: ["subvolume", "show", path],
    verbose: false,
  });
  return parseInt(stdout.split("Generation:")[1].split("\n")[0].trim());
}

const cache = refCache<Options & { noCache?: boolean }, Subvolume>({
  name: "btrfs-subvolumes",
  createObject: async (options: Options) => {
    const subvolume = new Subvolume(options);
    await subvolume.init();
    return subvolume;
  },
});

export async function subvolume(
  options: Options & { noCache?: boolean },
): Promise<Subvolume> {
  return await cache(options);
}
