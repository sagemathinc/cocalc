/*
NATS Kv associated to a project to keep track of open files.

DEVELOPMENT:

Change to packages/project, since packages/nats doesn't have a way to connect:

~/cocalc/src/packages/project$ node
> z = new (require('@cocalc/nats/sync/open-files').OpenFiles)({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf', env:await require('@cocalc/backend/nats').getEnv()})
> await z.touch({path:'a.txt',id:1})
> await z.get()
{
  'a.txt': { path: 'a.txt', open: true, id: 1, time: 2025-01-31T14:16:48.314Z }
}
> await z.touch({path:'foo/b.md',id:0})
undefined
> await z.get()
{
  'a.txt': { path: 'a.txt', interest: 1738298844728, open: true, id: 1, time: 2025-01-31T14:16:48.314Z },
  'foo/b.md': { path: 'foo/b.md', interest: 1738298896539, open: true, id: 0, time:... }
}
> await z.get({path:'foo/b.dm'})
null
> await z.get({path:'foo/b.md'})
{ path: 'foo/b.md', open: true, id: 0 }

> for await (const x of await z.watch()) { console.log(x)}

*/

import { type NatsEnv } from "@cocalc/nats/types";
import { getKv } from "./synctable-kv";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { sha1 } from "@cocalc/util/misc";
import { isEqual } from "lodash";

const PREFIX = `open-files`;

export interface Entry {
  // path to file relative to HOME
  path: string;
  // compute server id or 0/not defined for home base
  id?: number;
  // if true, then file should be opened, managed, and watched
  // by home base or compute server
  open?: boolean;
  // last time  this entry was changed -- this is automatically set
  // correctly by the NATS server in a consistent way:
  //   https://github.com/nats-io/nats-server/discussions/3095
  // It gets updated even if you set an object to itself (making no change).
  time?: Date;
}

const FIELDS = ["path", "id", "open"];

function validObject(obj: Entry) {
  const obj2: any = {};
  for (const field of FIELDS) {
    const val = obj[field];
    if (val != null) {
      if (field == "path") {
        obj2[field] = typeof val == "string" ? val : `${val}`;
      } else if (field == "id") {
        obj2[field] = typeof val == "number" ? val : parseInt(`${val}`);
      } else if (field == "open") {
        obj2[field] = typeof val == "boolean" ? val : !!val;
      }
    }
  }
  if (!obj2["path"]) {
    throw Error("path must be specified");
  }
  return obj2;
}

export class OpenFiles {
  private kv?;
  private nc;
  private jc;
  private sha1;
  private project_id: string;
  public state: "ready" | "closed" = "ready";
  private watches: any[] = [];

  constructor({ env, project_id }: { env: NatsEnv; project_id: string }) {
    this.sha1 = env.sha1 ?? sha1;
    this.nc = env.nc;
    this.jc = env.jc;
    this.project_id = project_id;
  }

  close = () => {
    this.state = "closed";
    for (const w of this.watches) {
      w.stop();
    }
    this.watches = [];
  };

  // When a client has a file open, they should periodically
  // touch it to indicate that it is open.
  // updates timestamp and ensures open=true.
  // id = compute_server_id.
  touch = async (obj0: { path: string; id?: number }) => {
    // just read and write it back, which updates the timestamp
    // no encode/decode needed.
    const obj = { ...validObject(obj0), open: true };
    const key = this.getKey(obj);
    const kv = await this.getKv();
    const mesg = await kv.get(key);
    if (mesg == null || mesg.sm.data.length == 0) {
      // no current entry -- create new
      await this.set(obj);
    } else {
      const cur = this.decode(mesg, true);
      const newValue = { ...cur, ...obj };
      if (!isEqual(cur, newValue)) {
        await this.set(newValue);
      } else {
        // update existing by just rewriting it back; this updates timestamp too
        await kv.put(key, mesg.sm.data);
      }
    }
  };

  closeFile = async ({ path }: { path: string }) => {
    const kv = await this.getKv();
    const key = this.getKey({ path });
    const mesg = await kv.get(key);
    if (mesg.sm.data.length == 0) {
      // nothing to do
      return;
    }
    const cur = this.decode(mesg, true);
    const value = this.jc.encode({ ...cur, open: false });
    await kv.put(key, value);
  };

  get = async (obj?: Entry) => {
    const kv = await this.getKv();
    if (obj == null) {
      // everything
      const keys = await kv.keys(`${PREFIX}.>`);
      const all: { [path: string]: Entry } = {};
      for await (const key of keys) {
        const obj = this.decode(await kv.get(key));
        all[obj.path] = obj;
      }
      return all;
    }
    return this.decode(await kv.get(this.getKey(validObject(obj))));
  };

  // watch for changes
  async *watch() {
    const kv = await this.getKv();
    const w = await kv.watch({
      key: `${PREFIX}.>`,
      // we assume that we ONLY delete old items which are not relevant
      ignoreDeletes: true,
    });
    this.watches.push(w);
    for await (const mesg of w) {
      // no need to check for 'mesg.value.length' due to ignoreDeletes above.
      yield this.decode(mesg);
      if (this.state == "closed") {
        return;
      }
    }
  }

  // delete entries that haven't been touched in ageMs milliseconds.
  // default=a month
  // returns number of deleted objects.
  expire = async (ageMs: number = 1000 * 60 * 60 * 730): Promise<number> => {
    let n = 0;
    const cutoff = new Date(Date.now() - ageMs);
    const kv = await this.getKv();
    const keys = await kv.keys(`${PREFIX}.>`);
    for await (const key of keys) {
      const mesg = await kv.get(key);
      if (mesg.sm.time <= cutoff) {
        await kv.delete(key);
        n += 1;
      }
    }
    return n;
  };

  // dangerous - e.g., our watcher assumes no deletes. Instead, you should
  // close files, not delete.
  delete = async (obj0) => {
    const obj = validObject(obj0);
    const kv = await this.getKv();
    await kv.delete(this.getKey(obj));
  };

  has = async ({ path }): Promise<boolean> => {
    const kv = await this.getKv();
    const key = this.getKey({ path });
    const mesg = await kv.get(key);
    return mesg.sm.data.length > 0;
  };

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

  // atomic set - NOT a merge set.
  private set = async (obj0: Entry) => {
    let obj = validObject(obj0);
    const key = this.getKey(obj);
    const value = this.jc.encode(obj);
    const kv = await this.getKv();
    await kv.put(key, value);
  };

  private decode = (mesg, noDate = false): Entry => {
    return {
      ...this.jc.decode(mesg.sm.data),
      ...(noDate ? undefined : { time: mesg.sm.time }),
    };
  };
}

import { dkv, type DKV } from "@cocalc/nats/sync/dkv";
export class OpenFiles2 {
  private project_id: string;
  private env: NatsEnv;
  private dkv?: DKV;

  constructor({ env, project_id }: { env: NatsEnv; project_id: string }) {
    this.env;
    this.project_id = project_id;
  }

  init = async () => {
    this.dkv = await dkv({
      name: "open-files",
      project_id: this.project_id,
      env: this.env,
    });
  };

  close = () => {
    if (this.dkv == null) {
      return;
    }
    this.dkv.close();
    delete this.dkv;
  };

  // When a client has a file open, they should periodically
  // touch it to indicate that it is open.
  // updates timestamp and ensures open=true.
  // do we need compute server?
//   touch = async ({ path }: { path: string }) => {
//     const { dkv } = this;
//     if (dkv == null) {
//       throw Error("closed");
//     }
//     cur = dkv.get(path);
//     const newValue = { ...cur, path };

//     // just read and write it back, which updates the timestamp
//     // no encode/decode needed.
//     const obj = { ...validObject(obj0), open: true };
//     const key = this.getKey(obj);
//     const kv = await this.getKv();
//     const mesg = await kv.get(key);
//     if (mesg == null || mesg.sm.data.length == 0) {
//       // no current entry -- create new
//       await this.set(obj);
//     } else {
//       const cur = this.decode(mesg, true);
//       const newValue = { ...cur, ...obj };
//       if (!isEqual(cur, newValue)) {
//         await this.set(newValue);
//       } else {
//         // update existing by just rewriting it back; this updates timestamp too
//         await kv.put(key, mesg.sm.data);
//       }
//     }
//   };
}
