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
    this.snapshotsDir = join(this.path, ".snapshots");
  }

  init = async () => {
    if (!(await exists(this.path))) {
      await sudo({
        command: "btrfs",
        args: ["subvolume", "create", this.path],
      });
      await this.makeSnapshotsDir();
      await this.chown(this.path);
      await this.setSize(
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

  setSize = async (size: string | number) => {
    await sudo({
      command: "btrfs",
      args: ["qgroup", "limit", `${size}`, this.path],
    });
  };

  getUsage = async (): Promise<{ size: number; usage: number }> => {
    const { max_referenced: size, referenced: usage } = await this.quotaInfo();
    return { usage, size };
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

  deleteSnapshot = async (name) => {
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
      // more than just the .snapshots directory?
      return (await listdir(this.path)).length > 1;
    }
    const pathGen = await getGeneration(this.path);
    const snapGen = await getGeneration(
      join(this.snapshotsDir, s[s.length - 1]),
    );
    console.log({ pathGen, snapGen });
    return snapGen < pathGen;
  };
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
