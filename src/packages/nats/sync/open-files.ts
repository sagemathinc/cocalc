/*
NATS Kv associated to a project to keep track of open files.

DEVELOPMENT:

~/cocalc/src/packages/project$ node
> z = new (require('@cocalc/nats/sync/open-files').OpenFiles)({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf', env:await require('@cocalc/backend/nats').getEnv()})
> await z.set({path:'a.txt',interest:Date.now(),open:true,id:1})
> await z.get()
{
  'a.txt': { path: 'a.txt', interest: 1738298844728, open: true, id: 1 }
}
> await z.set({path:'foo/b.md',interest:Date.now(),open:true,id:0})
undefined
> await z.get()
{
  'a.txt': { path: 'a.txt', interest: 1738298844728, open: true, id: 1 },
  'foo/b.md': { path: 'foo/b.md', interest: 1738298896539, open: true, id: 0 }
}
> await z.get('foo/b.dm')
null
> await z.get('foo/b.md')
{ path: 'foo/b.md', interest: 1738298896539, open: true, id: 0 }
*/

import { getKv, type NatsEnv } from "./synctable-kv";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { sha1 } from "@cocalc/util/misc";

const PREFIX = `open-files`;

interface Entry {
  // path to file relative to HOME
  path: string;
  // compute server id or 0/not defined for home base
  id?: number;
  // if true, then file should be opened, managed, and watched
  // by home base or compute server
  open?: boolean;
  // last time a client expressed interest in the file
  interest?: number;
}

export class OpenFiles {
  private kv?;
  private nc;
  private jc;
  private sha1;
  private project_id: string;

  constructor({ env, project_id }: { env: NatsEnv; project_id: string }) {
    this.sha1 = env.sha1 ?? sha1;
    this.nc = env.nc;
    this.jc = env.jc;
    this.project_id = project_id;
  }

  private getKv = reuseInFlight(async () => {
    if (this.kv == null) {
      this.kv = await getKv({
        nc: this.nc,
        project_id: this.project_id,
      });
    }
    return this.kv!;
  });

  private getKey = ({ path }: Entry): string => {
    return `${PREFIX}.${this.sha1(path)}`;
  };

  set = async (obj: Entry) => {
    const key = this.getKey(obj);
    const value = this.jc.encode(obj);
    const kv = await this.getKv();
    await kv.put(key, value);
  };

  delete = async (obj) => {
    const kv = await this.getKv();
    await kv.delete(this.getKey(obj));
  };

  private decode = (mesg) => {
    return mesg?.sm?.data != null ? this.jc.decode(mesg.sm.data) : null;
  };

  get = async (path?: string) => {
    const kv = await this.getKv();
    if (path == null) {
      // everything
      const keys = await kv.keys(`${PREFIX}.>`);
      const all: { [path: string]: Entry } = {};
      for await (const key of keys) {
        const obj = this.decode(await kv.get(key));
        all[obj.path] = obj;
      }
      return all;
    }
    return this.decode(await kv.get(this.getKey({ path })));
  };

  // watch for changes
  async *watch() {
    const kv = await this.getKv();
    const w = await kv.watch({
      key: `${PREFIX}.>`,
    });
    for await (const { value } of w) {
      yield this.jc.decode(value);
    }
  }
}
