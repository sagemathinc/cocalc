/*
A subvolume
*/

import { type Filesystem, DEFAULT_SUBVOLUME_SIZE } from "./filesystem";
import refCache from "@cocalc/util/refcache";
import {
  exists,
  listdir,
  mkdirp,
  sudo,
} from "@cocalc/file-server/storage-zfs/util";
import { join } from "path";
import { updateRollingSnapshots, type SnapshotCounts } from "./snapshots";
import { human_readable_size } from "@cocalc/util/misc";

export const SNAPSHOTS = ".snapshots";
const SEND_SNAPSHOT_PREFIX = "send-";

const BUP_SNAPSHOT = "temp-bup-snapshot";

const PAD = 4;

import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:storage-btrfs:subvolume");

interface Options {
  filesystem: Filesystem;
  name: string;
}

export class Subvolume {
  private filesystem: Filesystem;
  public readonly name: string;
  public readonly path: string;
  public readonly snapshotsDir: string;

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

  private quotaInfo = async () => {
    const { stdout } = await sudo({
      verbose: false,
      command: "btrfs",
      args: ["--format=json", "qgroup", "show", "-reF", this.path],
    });
    const x = JSON.parse(stdout);
    return x["qgroup-show"][0];
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

  usage = async (): Promise<{
    size: number;
    usage: number;
    human: { size: string; usage: string };
  }> => {
    let { max_referenced: size, referenced: usage } = await this.quotaInfo();
    if (size == "none") {
      size = null;
    }
    return {
      usage,
      size,
      human: {
        usage: human_readable_size(usage),
        size: size != null ? human_readable_size(size) : size,
      },
    };
  };

  private makeSnapshotsDir = async () => {
    if (await exists(this.snapshotsDir)) {
      return;
    }
    await mkdirp([this.snapshotsDir]);
    await this.chown(this.snapshotsDir);
    await sudo({ command: "chmod", args: ["a-w", this.snapshotsDir] });
  };

  createSnapshot = async (name: string) => {
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
      return (await listdir(this.path)).length > 1;
    }
    const pathGen = await getGeneration(this.path);
    const snapGen = await getGeneration(
      join(this.snapshotsDir, s[s.length - 1]),
    );
    return snapGen < pathGen;
  };

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
