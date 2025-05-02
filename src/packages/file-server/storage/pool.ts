import refCache from "@cocalc/util/refcache";
import { chmod, exec, exists, mkdirp } from "./util";
import { join } from "path";

const DEFAULT_SIZE = "10G";
const POOL_NAME_REGEXP = /^(?!-)(?!(\.{1,2})$)[A-Za-z0-9_.:-]{1,255}$/;

export interface Options {
  // where to store its image file(s)
  images: string;
  // where to mount its filesystems
  mount: string;
  // the name of the pool
  name: string;
}

export class Pool {
  private opts: Options;
  private image: string;

  constructor(opts: Options) {
    if (!POOL_NAME_REGEXP.test(opts.name)) {
      throw Error(`invalid ZFS pool name '${opts.name}'`);
    }
    this.opts = opts;
    this.image = join(opts.images, "0.img");
  }

  exists = async () => {
    return await exists(this.image);
  };

  destroy = async () => {
    if (!(await this.exists())) {
      return;
    }
    try {
      await exec({
        command: "sudo",
        args: ["zpool", "destroy", "-f", this.opts.name],
      });
    } catch (err) {
      if (!`${err}`.includes("no such pool")) {
        throw err;
      }
    }
    await exec({ command: "sudo", args: ["rm", this.image] });
    await exec({ command: "sudo", args: ["rmdir", this.opts.images] });
  };

  create = async () => {
    if (await this.exists()) {
      // already exists
      return;
    }
    await mkdirp([this.opts.images, this.opts.mount]);
    await chmod(["a+rx", this.opts.mount]);
    await exec({
      command: "sudo",
      args: ["truncate", "-s", DEFAULT_SIZE, this.image],
    });
    await exec({
      command: "sudo",
      args: [
        "zpool",
        "create",
        "-o",
        "feature@fast_dedup=enabled",
        "-m",
        this.opts.mount,
        this.opts.name,
        this.image,
      ],
      desc: `create the pool ${this.opts.name} using the device ${this.image}`,
    });
    await exec({
      command: "sudo",
      args: [
        "zfs",
        "set",
        "-o",
        "compression=lz4",
        "-o",
        "dedup=on",
        this.opts.name,
      ],
    });
  };

  list = async (): Promise<PoolListOutput> => {
    const { stdout } = await exec({
      command: "zpool",
      args: ["list", "-j", "--json-int", this.opts.name],
    });
    const x = JSON.parse(stdout);
    const y = x.pools[this.opts.name];
    for (const a in y.properties) {
      y.properties[a] = y.properties[a].value;
    }
    y.properties.dedupratio = parseFloat(y.properties.dedupratio);
    return y;
  };

  trim = async () => {
    await exec({
      command: "sudo",
      args: ["zpool", "trim", "-w", this.opts.name],
    });
  };

  // bytes of disk used by image
  bytes = async (): Promise<number> => {
    const { stdout } = await exec({
      command: "sudo",
      args: ["ls", "-s", this.image],
    });
    return parseFloat(stdout.split(" ")[0]);
  };

  close = () => {
    // nothing, yet
  };
}

const cache = refCache<Options & { noCache?: boolean }, Pool>({
  name: "zfs-pool",
  createObject: async (options: Options) => {
    return new Pool(options);
  },
});

export async function pool(
  options: Options & { noCache?: boolean },
): Promise<Pool> {
  return await cache(options);
}

interface PoolListOutput {
  name: string;
  type: "POOL";
  state: "ONLINE" | string; // todo
  pool_guid: number;
  txg: number;
  spa_version: number;
  zpl_version: number;
  properties: {
    size: number;
    allocated: number;
    free: number;
    checkpoint: string;
    expandsize: string;
    fragmentation: number;
    capacity: number;
    dedupratio: number;
    health: "ONLINE" | string; // todo
    altroot: string;
  };
}
