import { type Subvolume } from "./subvolume";
import { btrfs } from "./util";
import getLogger from "@cocalc/backend/logger";
import { join } from "path";
import { type DirectoryListingEntry } from "@cocalc/util/types";
import { SnapshotCounts, updateRollingSnapshots } from "./snapshots";

export const SNAPSHOTS = ".snapshots";
const logger = getLogger("file-server:btrfs:subvolume-snapshots");

export class SubvolumeSnapshots {
  public readonly snapshotsDir: string;

  constructor(public subvolume: Subvolume) {
    this.snapshotsDir = join(this.subvolume.path, SNAPSHOTS);
  }

  path = (snapshot?: string, ...segments) => {
    if (!snapshot) {
      return SNAPSHOTS;
    }
    return join(SNAPSHOTS, snapshot, ...segments);
  };

  private makeSnapshotsDir = async () => {
    if (await this.subvolume.fs.exists(SNAPSHOTS)) {
      return;
    }
    await this.subvolume.fs.mkdir(SNAPSHOTS);
    await this.subvolume.fs.chmod(SNAPSHOTS, "0700");
  };

  create = async (name?: string) => {
    if (name?.startsWith(".")) {
      throw Error("snapshot name must not start with '.'");
    }
    name ??= new Date().toISOString();
    logger.debug("create", { name, subvolume: this.subvolume.name });
    await this.makeSnapshotsDir();
    await btrfs({
      args: [
        "subvolume",
        "snapshot",
        "-r",
        this.subvolume.path,
        join(this.snapshotsDir, name),
      ],
    });
  };

  ls = async (): Promise<DirectoryListingEntry[]> => {
    await this.makeSnapshotsDir();
    return await this.subvolume.fs.ls(SNAPSHOTS, { hidden: false });
  };

  lock = async (name: string) => {
    if (await this.subvolume.fs.exists(this.path(name))) {
      this.subvolume.fs.writeFile(this.path(`.${name}.lock`), "");
    } else {
      throw Error(`snapshot ${name} does not exist`);
    }
  };

  unlock = async (name: string) => {
    await this.subvolume.fs.rm(this.path(`.${name}.lock`));
  };

  exists = async (name: string) => {
    return await this.subvolume.fs.exists(this.path(name));
  };

  delete = async (name) => {
    if (await this.subvolume.fs.exists(this.path(`.${name}.lock`))) {
      throw Error(`snapshot ${name} is locked`);
    }
    await btrfs({
      args: ["subvolume", "delete", join(this.snapshotsDir, name)],
    });
  };

  // update the rolling snapshots schedule
  update = async (counts?: Partial<SnapshotCounts>) => {
    return await updateRollingSnapshots({ snapshots: this, counts });
  };

  // has newly written changes since last snapshot
  hasUnsavedChanges = async (): Promise<boolean> => {
    const s = await this.ls();
    if (s.length == 0) {
      // more than just the SNAPSHOTS directory?
      const v = await this.subvolume.fs.ls("", { hidden: true });
      if (v.length == 0 || (v.length == 1 && v[0].name == SNAPSHOTS)) {
        return false;
      }
      return true;
    }
    const pathGen = await getGeneration(this.subvolume.path);
    const snapGen = await getGeneration(
      join(this.snapshotsDir, s[s.length - 1].name),
    );
    return snapGen < pathGen;
  };
}

async function getGeneration(path: string): Promise<number> {
  const { stdout } = await btrfs({
    args: ["subvolume", "show", path],
    verbose: false,
  });
  return parseInt(stdout.split("Generation:")[1].split("\n")[0].trim());
}
