import refCache from "@cocalc/util/refcache";
import { sudo } from "./util";

const FILESYSTEM_NAME_REGEXP = /^(?!-)(?!(\.{1,2})$)[A-Za-z0-9_.:-]{1,255}$/;

export interface Options {
  // name of pool
  pool: string;
  // name of filesystem
  name: string;
}

export class Filesystem {
  private dataset: string;

  constructor(opts: Options) {
    if (!FILESYSTEM_NAME_REGEXP.test(opts.name)) {
      throw Error(`invalid ZFS filesystem name '${opts.name}'`);
    }
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
    await sudo({
      command: "zfs",
      args: ["create", this.dataset],
    });
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

  close = () => {
    // nothing, yet
  };
}

interface FilesystemListOutput {}

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
