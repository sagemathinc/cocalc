/*
DEVELOPMENT:

Start node, then:

a = require('@cocalc/file-server/storage-zfs')
pools = await a.pools({images:'/data/zfs/images', mount:'/data/zfs/mnt'})

x = await pools.pool('x')

t = await x.list()

p = await x.filesystem('1')
await p.create()

await x.enlarge('1T')

await x.shrink('3G')

await p.get('compressratio')

await p.list()

q = await x.clone('c', '1')
await q.create()
await q.get('origin')   // --> 'x/1@clone-c'

// around 10 seconds:

t = Date.now(); for(let i=0; i<100; i++) { await (await pools.pool('x'+i)).create() }; Date.now() - t

// around 5 seconds:

t = Date.now(); for(let i=0; i<100; i++) { await (await x.filesystem('x'+i)).create() }; Date.now() - t


*/

import refCache from "@cocalc/util/refcache";
import { join } from "path";
import { listdir, mkdirp, sudo } from "./util";
import { pool } from "./pool";

export interface Options {
  images: string;
  mount: string;
}

export class Pools {
  private opts: Options;

  constructor(opts: Options) {
    this.opts = opts;
  }

  init = async () => {
    await mkdirp([this.opts.images, this.opts.mount]);
  };

  close = () => {
    // nothing, yet
  };

  pool = async (name: string) => {
    const images = join(this.opts.images, name);
    const mount = join(this.opts.mount, name);
    return await pool({ images, mount, name });
  };

  list = async (): Promise<string[]> => {
    return await listdir(this.opts.images);
  };

  rsync = async ({
    src,
    target,
    args = ["-axH"],
    timeout = 5 * 60 * 1000,
  }: {
    src: string;
    target: string;
    args?: string[];
    timeout?: number;
  }): Promise<{ stdout: string; stderr: string; exit_code: number }> => {
    const srcPool = await this.pool(src.split("/")[0]);
    await srcPool.import();
    const targetPool = await this.pool(target.split("/")[0]);
    await targetPool.import();
    const srcPath = join(this.opts.mount, src);
    const targetPath = join(this.opts.mount, target);
    return await sudo({
      command: "rsync",
      args: [...args, srcPath, targetPath],
      err_on_exit: false,
      timeout: timeout / 1000,
    });
  };
}

const cache = refCache<Options & { noCache?: boolean }, Pools>({
  name: "zfs-pools",
  createObject: async (options: Options) => {
    const pools = new Pools(options);
    await pools.init();
    return pools;
  },
});

export async function pools(
  options: Options & { noCache?: boolean },
): Promise<Pools> {
  return await cache(options);
}
