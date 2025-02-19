/*
NATS Kv associated to a project to keep track of open files.

DEVELOPMENT:

Change to packages/backend, since packages/nats doesn't have a way to connect:

~/cocalc/src/packages/backend$ node

> z = await require('@cocalc/backend/nats/sync').openFiles({project_id:cc.current().project_id)
> z.touch({path:'a.txt'})
> z.get({path:'a.txt'})
{ open: true, count: 1, time:2025-02-09T16:37:20.713Z }
> z.touch({path:'a.txt'})
> z.get({path:'a.txt'})
{ open: true, count: 2 }
> z.time({path:'a.txt'})
2025-02-09T16:36:58.510Z
> z.touch({path:'foo/b.md',id:0})
> z.getAll()
{
  'a.txt': { open: true, count: 3 },
  'foo/b.md': { open: true, count: 1 }

Frontend Dev in browser:

z = await cc.client.nats_client.openFiles({project_id:cc.current().project_id))
z.getAll()
}
*/

import { type NatsEnv, type State } from "@cocalc/nats/types";
import { dkv, type DKV } from "@cocalc/nats/sync/dkv";
import { nanos } from "@cocalc/nats/util";
import { EventEmitter } from "events";
import time from "@cocalc/nats/time";

// info about interest in open files (and also what was explicitly deleted) older
// than this is automatically purged.
const MAX_AGE_MS = 7 * (1000 * 60 * 60 * 24);

export interface Entry {
  // path to file relative to HOME
  path: string;
  // a web browser has the file open at this point in time (in ms)
  time?: number;
  // if the file was removed from disk (and not immmediately written back),
  // then deleted gets set to the time when this happened (in ms since epoch)
  // and the file is closed on the backend.  It won't be re-opened until
  // either (1) the file is created on disk again, or (2) deleted is cleared.
  // Note: the actual time here isn't really important -- what matter is the number
  // is nonzero.  It's just used for a display to the user.
  deleted?: number;
}

interface Options {
  env: NatsEnv;
  project_id: string;
  noAutosave?: boolean;
  noCache?: boolean;
}

export async function createOpenFiles(opts: Options) {
  const openFiles = new OpenFiles(opts);
  await openFiles.init();
  return openFiles;
}

export class OpenFiles extends EventEmitter {
  private project_id: string;
  private env: NatsEnv;
  private noCache?: boolean;
  private noAutosave?: boolean;
  private dkv?: DKV;
  public state: "disconnected" | "connected" | "closed" = "disconnected";

  constructor({ env, project_id, noAutosave, noCache }: Options) {
    super();
    if (!env) {
      throw Error("env must be specified");
    }
    if (!project_id) {
      throw Error("project_id must be specified");
    }
    this.env = env;
    this.project_id = project_id;
    this.noAutosave = noAutosave;
    this.noCache = noCache;
  }

  private setState = (state: State) => {
    this.state = state;
    this.emit(state);
  };

  init = async () => {
    const d = await dkv<Entry>({
      name: "open-files",
      project_id: this.project_id,
      env: this.env,
      limits: {
        max_age: nanos(MAX_AGE_MS),
      },
      noAutosave: this.noAutosave,
      noCache: this.noCache,
      merge: ({ local, remote }) => {
        // resolve conflicts by merging object state.  This is important so, e.g., the
        // deleted state doesn't get overwritten on reconnect by clients that didn't know.
        //console.log("merge", local, remote, { ...remote, ...local });
        return { ...remote, ...local };
      },
    });
    this.dkv = d;
    d.on("change", ({ key: path }) => {
      const entry = this.get(path);
      if (entry != null) {
        // not deleted and timestamp is set:
        this.emit("change", entry as Entry);
      }
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

  private set = (path, entry: Entry) => {
    this.getDkv().set(path, entry);
  };

  // When a client has a file open, they should periodically
  // touch it to indicate that it is open.
  // updates timestamp and ensures open=true.
  touch = (path: string) => {
    if (!path) {
      throw Error("path must be specified");
    }
    const dkv = this.getDkv();
    // n =  sequence number to make sure a write happens, which updates
    // server assigned timestamp.
    const cur = dkv.get(path);
    let t;
    try {
      t = time().valueOf();
    } catch {
      // give up -- try again once initialized
      return;
    }
    this.set(path, {
      ...cur,
      time: t,
    });
  };

  setError = (path: string, err?: any) => {
    const dkv = this.getDkv();
    if (!err) {
      const current = { ...dkv.get(path) };
      delete current.error;
      this.set(path, current);
    } else {
      const current = { ...dkv.get(path) };
      current.error = { time: Date.now(), error: `${err}` };
      this.set(path, current);
    }
  };

  setDeleted = (path: string) => {
    const dkv = this.getDkv();
    this.set(path, { ...dkv.get(path), deleted: Date.now() });
  };

  isDeleted = (path: string) => {
    return !!this.getDkv().get(path)?.deleted;
  };

  setNotDeleted = (path: string) => {
    const dkv = this.getDkv();
    let cur = dkv.get(path);
    if (cur == null) {
      return;
    }
    cur = { ...cur };
    delete cur.deleted;
    this.set(path, cur);
  };

  getAll = (): Entry[] => {
    const x = this.getDkv().getAll();
    return Object.keys(x).map((path) => {
      return { ...x[path], path };
    });
  };

  get = (path: string): Entry | undefined => {
    const x = this.getDkv().get(path);
    if (x == null) {
      return x;
    }
    return { ...x, path };
  };

  delete = (path) => {
    this.getDkv().delete(path);
  };

  clear = () => {
    this.getDkv().clear();
  };

  save = async () => {
    await this.getDkv().save();
  };

  hasUnsavedChanges = () => {
    return this.getDkv().hasUnsavedChanges();
  };
}
