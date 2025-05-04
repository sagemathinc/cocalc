import refCache from "@cocalc/util/refcache";
import { chmod, sudo, exists, mkdirp, rm, rmdir, listdir } from "./util";
import { join } from "path";
import { filesystem } from "./filesystem";
import getLogger from "@cocalc/backend/logger";
import { executeCode } from "@cocalc/backend/execute-code";
import { randomId } from "@cocalc/nats/names";

const logger = getLogger("file-server:storage:pool");

const DEFAULT_SIZE = "1G";
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
    if (await exists(this.image)) {
      await rm([this.image]);
    }
    if (await exists(this.opts.images)) {
      await rmdir([this.opts.images]);
    }
    if (await exists(this.opts.mount)) {
      const v = await listdir(this.opts.mount);
      await rmdir(v.map((x) => join(this.opts.mount, x)));
      await rmdir([this.opts.mount]);
    }
  };

  // enlarge pool to have given size (which can be a string like '1G' or
  // a number of bytes). This is very fast/CHEAP and can be done live.
  enlarge = async (size: string | number) => {
    logger.debug(`enlarge to ${size}`);
    size = await sizeToBytes(size);
    if (typeof size != "number") {
      throw Error("bug");
    }
    if (!(await exists(this.image))) {
      await this.create();
    }
    const { stdout } = await sudo({
      command: "stat",
      args: ["--format=%s", this.image],
    });
    const bytes = parseFloat(stdout);
    if (size < bytes) {
      throw Error(`size must be at least ${bytes}`);
    }
    if (size == bytes) {
      return;
    }
    await this.ensureExists<void>(async () => {
      await sudo({ command: "truncate", args: ["-s", `${size}`, this.image] });
      await sudo({
        command: "zpool",
        args: ["online", "-e", this.opts.name, this.image],
      });
    });
  };

  // shrink pool to have given size (which can be a string like '1G' or
  // a number of bytes). This is EXPENSIVE, requiring rewriting everything, and
  // the pool must be unmounted.
  shrink = async (size: string | number) => {
    // TODO: this is so dangerous, so make sure there is a backup first, once
    // backups are implemented
    logger.debug(`shrink to ${size}`);
    logger.debug("shrink -- 0. size checks");
    size = await sizeToBytes(size);
    if (typeof size != "number") {
      throw Error("bug");
    }
    if (size < (await sizeToBytes(DEFAULT_SIZE))) {
      throw Error(`size must be at least ${DEFAULT_SIZE}`);
    }
    const info = await this.info();
    // TOOD: this is made up
    const min_alloc = info.properties.allocated * 1.25 + 1000000;
    if (size <= min_alloc) {
      throw Error(
        `size must be at least as big as currently allocated space ${min_alloc}`,
      );
    }
    if (size >= info.properties.size) {
      logger.debug("shrink -- it's already smaller than the shrink goal.");
      return;
    }
    logger.debug("shrink -- 1. unmount all datasets");
    for (const dataset of Object.keys(await this.list())) {
      try {
        await sudo({ command: "zfs", args: ["unmount", dataset] });
      } catch (err) {
        if (`${err}`.includes("not currently mounted")) {
          // that's fine
          continue;
        }
        throw err;
      }
    }
    logger.debug("shrink -- 2. make new smaller temporary pool");
    const id = "-" + randomId();
    const name = this.opts.name + id;
    const images = this.opts.images + id;
    const mount = this.opts.mount + id;
    const temp = await pool({ images, mount, name });
    await temp.create();
    await temp.enlarge(size);
    const snapshot = `${this.opts.name}@shrink${id}`;
    logger.debug("shrink -- 3. replicate data to target");
    await sudo({ command: "zfs", args: ["snapshot", "-r", snapshot] });
    try {
      await executeCode({
        command: `sudo zfs send -c -R ${snapshot} | sudo zfs recv -F ${name}`,
      });
    } catch (err) {
      await temp.destroy();
      throw err;
    }
    await temp.export();

    logger.debug("shrink -- 4. destroy original pool");
    await this.destroy();
    logger.debug("shrink -- 5. rename temporary pool");
    await sudo({
      command: "zpool",
      args: ["import", "-d", images, name, this.opts.name],
    });
    await sudo({
      command: "zpool",
      args: ["export", this.opts.name],
    });
    logger.debug("shrink -- 6. move image file");
    await mkdirp([this.opts.images, this.opts.mount]);
    await sudo({ command: "mv", args: [temp.image, this.image] });
    logger.debug("shrink -- 7. destroy temp files");
    await temp.destroy();
    logger.debug("shrink -- 8. Import our new pool");
    await this.import();
  };

  filesystem = async (name) => {
    await this.import();
    return await filesystem({ pool: this.opts.name, name });
  };

  // create a lightweight clone callend name of the given filesystem source.
  clone = async (name: string, source: string) => {
    await this.import();
    return await filesystem({ pool: this.opts.name, name, clone: source });
  };

  import = async () => {
    if (!(await this.exists())) {
      await this.create();
      return;
    }
    try {
      await sudo({
        command: "zpool",
        args: ["import", this.opts.name, "-d", this.opts.images],
        verbose: false,
      });
    } catch (err) {
      if (`${err}`.includes("pool with that name already exists")) {
        // already imported
        return;
      }
      throw err;
    }
  };

  export = async () => {
    try {
      await sudo({
        command: "zpool",
        args: ["export", this.opts.name],
      });
    } catch (err) {
      if (`${err}`.includes("no such pool")) {
        return;
      }
      throw err;
    }
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

async function sizeToBytes(size: number | string): Promise<number> {
  if (typeof size == "number") {
    return size;
  }
  const { stdout } = await executeCode({
    command: "numfmt",
    args: ["--from=iec", size],
  });
  return parseFloat(stdout);
}
