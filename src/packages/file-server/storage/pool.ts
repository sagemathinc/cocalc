import refCache from "@cocalc/util/refcache";
import { chmod, sudo, exists, mkdirp, rm, rmdir, listdir } from "./util";
import { join } from "path";
import { filesystem } from "./filesystem";

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
      await sudo({
        command: "zpool",
        args: ["destroy", "-f", this.opts.name],
      });
    } catch (err) {
      if (!`${err}`.includes("no such pool")) {
        throw err;
      }
    }
    await rm([this.image]);
    await rmdir([this.opts.images]);
    if (await exists(this.opts.mount)) {
      await rmdir(await listdir(this.opts.mount));
      await rmdir([this.opts.mount]);
    }
  };

  filesystem = async ({ name, clone }: { name: string; clone?: string }) => {
    // ensure available
    await this.list();
    return await filesystem({ pool: this.opts.name, name, clone });
  };

  import = async () => {
    if (!(await this.exists())) {
      await this.create();
      return;
    }
    await sudo({
      command: "zpool",
      args: ["import", this.opts.name, "-d", this.opts.images],
    });
  };

  create = async () => {
    if (await this.exists()) {
      // already exists
      return;
    }
    await mkdirp([this.opts.images, this.opts.mount]);
    await chmod(["a+rx", this.opts.mount]);
    await sudo({
      command: "truncate",
      args: ["-s", DEFAULT_SIZE, this.image],
    });
    await sudo({
      command: "zpool",
      args: [
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
    await sudo({
      command: "zfs",
      args: ["set", "compression=lz4", "dedup=on", this.opts.name],
    });
  };

  private async ensureExists<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (err) {
      if (`${err}`.includes("no such pool")) {
        await this.import();
        return await f();
      }
      throw err;
    }
    throw Error("bug");
  }

  info = async (): Promise<PoolListOutput> => {
    return await this.ensureExists<PoolListOutput>(async () => {
      const { stdout } = await sudo({
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
    });
  };

  status = async (): Promise<PoolListOutput> => {
    return await this.ensureExists<PoolListOutput>(async () => {
      const { stdout } = await sudo({
        command: "zpool",
        args: ["status", "-j", "--json-int", this.opts.name],
      });
      const x = JSON.parse(stdout);
      return x.pools[this.opts.name];
    });
  };

  trim = async () => {
    return await this.ensureExists<void>(async () => {
      await sudo({
        command: "zpool",
        args: ["trim", "-w", this.opts.name],
      });
    });
  };

  // bytes of disk used by image
  bytes = async (): Promise<number> => {
    const { stdout } = await sudo({
      command: "ls",
      args: ["-s", this.image],
    });
    return parseFloat(stdout.split(" ")[0]);
  };

  list = async (): Promise<{ [dataset: string]: Dataset }> => {
    return await this.ensureExists<{ [dataset: string]: Dataset }>(async () => {
      const { stdout } = await sudo({
        command: "zfs",
        args: ["list", "-j", "--json-int", "-r", this.opts.name],
      });
      const { datasets } = JSON.parse(stdout);
      for (const name in datasets) {
        const y = datasets[name];
        for (const a in y.properties) {
          y.properties[a] = y.properties[a].value;
        }
      }
      return datasets;
    });
  };

  close = () => {
    // nothing, yet
  };
}

interface Dataset {
  name: string;
  type: "FILESYSTEM";
  pool: string;
  createtxg: number;
  properties: {
    used: number;
    available: number;
    referenced: number;
    mountpoint: string;
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
