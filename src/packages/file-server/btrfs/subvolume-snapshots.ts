import { type Subvolume } from "./subvolume";
import { btrfs } from "./util";
import getLogger from "@cocalc/backend/logger";
import { join } from "path";
import { type SnapshotCounts, updateRollingSnapshots } from "./snapshots";
import { ConatError } from "@cocalc/conat/core/client";
import { type SnapshotUsage } from "@cocalc/conat/files/file-server";
import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";
import { getSubvolumeField, getSubvolumeId } from "./subvolume";

const logger = getLogger("file-server:btrfs:subvolume-snapshots");

export class SubvolumeSnapshots {
  public readonly snapshotsDir: string;

  constructor(public readonly subvolume: Subvolume) {
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

  create = async (name?: string, { limit }: { limit?: number } = {}) => {
    if (name?.startsWith(".")) {
      throw Error("snapshot name must not start with '.'");
    }
    name ??= new Date().toISOString();
    logger.debug("create", { name, subvolume: this.subvolume.name });
    await this.makeSnapshotsDir();

    if (limit != null) {
      const existing = (await this.readdir()).filter(
        // lock files are named ".<snap>.lock" — exclude those from the limit
        // (NOTE: we do NOT allow any real snapshot to start with '.' -- see above)
        (x) => !x.endsWith(".lock"),
      );
      if (existing.length >= limit) {
        // 507 = "insufficient storage" for http
        throw new ConatError(`there is a limit of ${limit} snapshots`, {
          code: 507,
        });
      }
    }

    const args = ["subvolume", "snapshot", "-r"];
    const snapshotPath = join(this.snapshotsDir, name);
    args.push(this.subvolume.path, snapshotPath);

    await btrfs({ args });

    // also add snapshot to the snapshot quota group
    const snapshotId = await getSubvolumeId(snapshotPath);
    const subvolumeId = await this.subvolume.getSubvolumeId();
    await btrfs({
      args: [
        "qgroup",
        "assign",
        `0/${snapshotId}`,
        `1/${subvolumeId}`,
        this.subvolume.path,
      ],
    });
  };

  readdir = async (): Promise<string[]> => {
    await this.makeSnapshotsDir();
    const entries = await this.subvolume.fs.readdir(SNAPSHOTS);
    const snapshots: string[] = [];
    for (const name of entries) {
      // Skip lock/hidden files up front.
      if (name.startsWith(".")) continue;
      const path = join(this.snapshotsDir, name);
      try {
        // Only keep readonly btrfs subvolumes (actual snapshots).
        const readonly = await getSubvolumeField(path, "Read-only");
        if (readonly?.toLowerCase().startsWith("yes")) {
          snapshots.push(name);
        }
      } catch (err) {
        logger.debug("readdir: skipping non-snapshot entry", {
          path,
          err: `${err}`,
        });
      }
    }
    snapshots.sort();
    return snapshots;
  };

  lock = async (name: string) => {
    if (await this.subvolume.fs.exists(this.path(name))) {
      await this.subvolume.fs.writeFile(this.path(`.${name}.lock`), "");
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

  // update the rolling snapshots scheduleGener
  update = async (counts?: Partial<SnapshotCounts>, opts?) => {
    return await updateRollingSnapshots({ snapshots: this, counts, opts });
  };

  // has newly written changes since last snapshot
  hasUnsavedChanges = async (): Promise<boolean> => {
    const s = await this.readdir();
    if (s.length == 0) {
      // more than just the SNAPSHOTS directory?
      const v = await this.subvolume.fs.readdir("");
      if (v.length == 0 || (v.length == 1 && v[0] == SNAPSHOTS)) {
        return false;
      }
      return true;
    }
    const pathGen = await getGeneration(this.subvolume.path);
    const snapGen = await getGeneration(
      join(this.snapshotsDir, s[s.length - 1]),
    );
    return snapGen < pathGen;
  };

  usage = async (name: string): Promise<SnapshotUsage> => {
    // btrfs --format=json qgroup show -reF --raw project-eac5b48a-70aa-4401-a54d-0f58c5eb09ba/.snapshots/cocalc
    const snapshotPath = join(this.snapshotsDir, name);
    const { stdout } = await btrfs({
      args: ["--format=json", "qgroup", "show", "-ref", "--raw", snapshotPath],
    });
    const x = JSON.parse(stdout);
    const { referenced, max_referenced, exclusive } = x["qgroup-show"][0];
    return { name, used: referenced, quota: max_referenced, exclusive };
  };

  allUsage = async (): Promise<SnapshotUsage[]> => {
    // get quota/usage information about all snapshots
    const snaps = await this.readdir();
    return Promise.all(snaps.map(this.usage));
  };
}

export async function getGeneration(path: string): Promise<number> {
  return parseInt(await getSubvolumeField(path, "Generation"));
}
