import refCache from "@cocalc/util/refcache";
import { sudo } from "./util";

const FILESYSTEM_NAME_REGEXP = /^(?!-)(?!(\.{1,2})$)[A-Za-z0-9_.:-]{1,255}$/;

export interface Options {
  // name of pool
  pool: string;
  // name of filesystem
  name: string;
  // if given when creating the current filesystem, it will be made as a clone
  // of "clone".  This only needs to be set when the filesystem is created.
  clone?: string;
}

export class Filesystem {
  private dataset: string;
  private opts: Options;

  constructor(opts: Options) {
    if (!FILESYSTEM_NAME_REGEXP.test(opts.name)) {
      throw Error(`invalid ZFS filesystem name '${opts.name}'`);
    }
    this.opts = opts;
    this.dataset = `${opts.pool}/${opts.name}`;
  }

  exists = async () => {
    try {
      await this.list0();
      return true;
    } catch {
      return false;
    }
  };

  private async ensureExists<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (err) {
      if (`${err}`.includes("dataset does not exist")) {
        await this.create();
        return await f();
      }
    }
    throw Error("bug");
  }

  create = async () => {
    if (await this.exists()) {
      return;
    }
    if (this.opts.clone) {
      const snapshot = `${this.opts.pool}/${this.opts.clone}@clone-${this.opts.name}`;
      await sudo({
        command: "zfs",
        args: ["snapshot", snapshot],
      });
      try {
        // create as a clone
        await sudo({
          command: "zfs",
          args: ["clone", snapshot, this.dataset],
        });
      } catch (err) {
        // we only delete the snapshot on error, since it can't be deleted as
        // long as the clone exists:
        await sudo({ command: "zfs", args: ["destroy", snapshot] });
        throw err;
      }
    } else {
      // non-clone
      await sudo({
        command: "zfs",
        args: ["create", this.dataset],
      });
    }
  };

  list = async (): Promise<FilesystemListOutput> => {
    return await this.ensureExists<FilesystemListOutput>(this.list0);
  };

  private list0 = async (): Promise<FilesystemListOutput> => {
    const { stdout } = await sudo({
      command: "zfs",
      args: ["list", "-j", "--json-int", this.dataset],
    });
    const x = JSON.parse(stdout);
    const y = x.datasets[this.dataset];
    for (const a in y.properties) {
      y.properties[a] = y.properties[a].value;
    }
    return y;
  };

  get = async (property: string) => {
    return await this.ensureExists<FilesystemListOutput>(async () => {
      const { stdout } = await sudo({
        command: "zfs",
        args: ["get", "-j", "--json-int", property, this.dataset],
      });
      const x = JSON.parse(stdout);
      const { value } = x.datasets[this.dataset].properties[property];
      if (/^-?\d+(\.\d+)?$/.test(value)) {
        return parseFloat(value);
      } else {
        return value;
      }
    });
  };

  set = async (props: { [property: string]: any }) => {
    return await this.ensureExists<void>(async () => {
      const v: string[] = [];
      for (const p in props) {
        v.push(`${p}=${props[p]}`);
      }
      if (v.length == 0) {
        return;
      }
      await sudo({
        command: "zfs",
        args: ["set", ...v, this.dataset],
      });
    });
  };

  close = () => {
    // nothing, yet
  };
}

interface FilesystemListOutput {
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

const cache = refCache<Options & { noCache?: boolean }, Filesystem>({
  name: "zfs-filesystem",
  createObject: async (options: Options) => {
    return new Filesystem(options);
  },
});

export async function filesystem(
  options: Options & { noCache?: boolean },
): Promise<Filesystem> {
  return await cache(options);
}
