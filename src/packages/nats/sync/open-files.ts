/*
NATS Kv associated to a project to keep track of open files.

DEVELOPMENT:

Change to packages/backend, since packages/nats doesn't have a way to connect:

~/cocalc/src/packages/backend node
> z = await require('@cocalc/nats/sync/open-files').createOpenFiles({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf', env:await require('@cocalc/backend/nats').getEnv()})
> z.touch({path:'a.txt'})
> z.get({path:'a.txt'})
{ open: true, count: 1 }
> z.touch({path:'a.txt'})
> z.get({path:'a.txt'})
{ open: true, count: 2 }
> z.time({path:'a.txt'})
2025-02-09T16:36:58.510Z
> z.touch({path:'foo/b.md',id:0})
> z.get()
{
  'a.txt': { open: true, count: 3 },
  'foo/b.md': { open: true, count: 1 }
}
*/

import { type NatsEnv, type State } from "@cocalc/nats/types";
import { dkv, type DKV } from "@cocalc/nats/sync/dkv";
import { nanos } from "@cocalc/nats/util";
import { EventEmitter } from "events";

// 1 week
const MAX_AGE_MS = 1000 * 60 * 60 * 168;

export interface Entry {
  // path to file relative to HOME
  path: string;
  // if true, then file should be opened, managed, and watched
  // by home base or compute server
  open?: boolean;
  // last time  this entry was changed -- this is automatically set
  // correctly by the NATS server in a consistent way:
  //   https://github.com/nats-io/nats-server/discussions/3095
  // It gets updated even if you set an object to itself (making no change).
  time?: Date;
  //
  count?: number;
}

export async function createOpenFiles({ env, project_id }) {
  const openFiles = new OpenFiles({ env, project_id });
  await openFiles.init();
  return openFiles;
}

export class OpenFiles extends EventEmitter {
  private project_id: string;
  private env: NatsEnv;
  private dkv?: DKV;
  public state: "disconnected" | "connected" | "closed" = "disconnected";

  constructor({ env, project_id }: { env: NatsEnv; project_id: string }) {
    super();
    this.env = env;
    this.project_id = project_id;
  }

  private setState = (state: State) => {
    this.state = state;
    this.emit(state);
  };

  init = async () => {
    const d = await dkv({
      name: "open-files",
      project_id: this.project_id,
      env: this.env,
      limits: {
        max_age: nanos(MAX_AGE_MS),
      },
    });
    this.dkv = d;
    d.on("change", ({ key: path, value }) => {
      const time = d.time(path);
      const { open } = value ?? {};
      this.emit("change", { path, open, time } as Entry);
    });
    this.setState("connected");
  };

  close = () => {
    if (this.dkv == null) {
      return;
    }
    this.setState("closed");
    this.removeAllListeners();
    this.dkv.close();
    delete this.dkv;
    // @ts-ignore
    delete this.env;
    // @ts-ignore
    delete this.project_id;
  };

  private getDkv = () => {
    const { dkv } = this;
    if (dkv == null) {
      throw Error("closed");
    }
    return dkv;
  };

  // When a client has a file open, they should periodically
  // touch it to indicate that it is open.
  // updates timestamp and ensures open=true.
  // do we need compute server?
  touch = ({ path }: { path: string }) => {
    const dkv = this.getDkv();
    // n =  sequence number to make sure a write happens, which updates
    // server assigned timestamp.
    const count = dkv.get(path)?.count ?? 0;
    dkv.set(path, { open: true, count: count + 1 });
  };

  closeFile = ({ path }: { path: string }) => {
    const dkv = this.getDkv();
    dkv.set(path, { ...dkv.get(path), open: false });
  };

  get = (obj?: { path: string }) => {
    return this.getDkv().get(obj?.path);
  };

  delete = ({ path }: { path: string }) => {
    this.getDkv().delete(path);
  };

  time = (obj?: { path: string }) => {
    return this.getDkv().time(obj?.path);
  };
}
