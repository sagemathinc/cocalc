/*
DEVELOPMENT:

Start node, then:

a = require('@cocalc/file-server/storage')
pools = await a.pools({images:'/data/zfs/images', mount:'/data/zfs/mnt'})

x = await pools.pool({name:'x'})
await x.create()

t = await x.list()

p = await x.filesystem({name:'1'})
await p.create()

await p.get('compressratio')

await p.list()

q = await x.filesystem({name:'c', clone:'1'})
await q.create()
await q.get('origin')   // --> 'x/1@clone-c'

// around 10 seconds:

t = Date.now(); for(let i=0; i<100; i++) { await (await pools.pool({name:'x'+i})).create() }; Date.now() - t

// around 5 seconds:

t = Date.now(); for(let i=0; i<100; i++) { await (await x.filesystem({name:'x'+i})).create() }; Date.now() - t


*/

import refCache from "@cocalc/util/refcache";
import { join } from "path";
import { listdir, mkdirp } from "./util";
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

  pool = async ({ name }: { name: string }) => {
    const images = join(this.opts.images, name);
    const mount = join(this.opts.mount, name);
    return await pool({ images, mount, name });
  };

  list = async (): Promise<string[]> => {
    return await listdir(this.opts.images);
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
