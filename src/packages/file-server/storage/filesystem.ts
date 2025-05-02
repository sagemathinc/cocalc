import refCache from "@cocalc/util/refcache";
import { exec } from "./util";

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
      await this.list();
      return true;
    } catch {
      return false;
    }
  };

  create = async () => {
    if (await this.exists()) {
      return;
    }
    await exec({
      command: "sudo",
      args: ["zfs", "create", this.dataset],
    });
  };

  list = async (): Promise<any> => {
    const { stdout } = await exec({
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
