import { type Subvolume } from "./subvolume";
import { btrfs } from "./util";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:btrfs:subvolume-quota");

export class SubvolumeQuota {
  constructor(public subvolume: Subvolume) {}

  private qgroup = async () => {
    const { stdout } = await btrfs({
      verbose: false,
      args: ["--format=json", "qgroup", "show", "-reF", this.subvolume.path],
    });
    const x = JSON.parse(stdout);
    return x["qgroup-show"][0];
  };

  get = async (): Promise<{
    size: number;
    used: number;
  }> => {
    let { max_referenced: size, referenced: used } = await this.qgroup();
    if (size == "none") {
      size = null;
    }
    return {
      used,
      size,
    };
  };

  set = async (size: string | number) => {
    if (!size) {
      throw Error("size must be specified");
    }
    logger.debug("setQuota ", this.subvolume.path, size);
    await btrfs({
      args: ["qgroup", "limit", `${size}`, this.subvolume.path],
    });
    // also set the exact same quota for the total of all snapshots:
    const id = await this.subvolume.getSubvolumeId();
    await btrfs({
      args: ["qgroup", "limit", `${size}`, `1/${id}`, this.subvolume.path],
    });
  };

  du = async () => {
    return await btrfs({
      args: ["filesystem", "du", "-s", this.subvolume.path],
    });
  };

  usage = async (): Promise<{
    // used and free in bytes
    used: number;
    free: number;
    size: number;
  }> => {
    const { stdout } = await btrfs({
      args: ["filesystem", "usage", "-b", this.subvolume.path],
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
}
