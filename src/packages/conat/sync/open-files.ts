/*
NATS Kv associated to a project to keep track of open files.

DEVELOPMENT:

Change to packages/backend, since packages/nats doesn't have a way to connect:

~/cocalc/src/packages/backend$ node

> z = await require('@cocalc/backend/conat/sync').openFiles({project_id:cc.current().project_id})
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

z = await cc.client.conat_client.openFiles({project_id:cc.current().project_id))
z.getAll()
}
*/

import { type State } from "@cocalc/conat/types";
import { dkv, type DKV } from "@cocalc/conat/sync/dkv";
import { EventEmitter } from "events";
import getTime, { getSkew } from "@cocalc/conat/time";

// info about interest in open files (and also what was explicitly deleted) older
// than this is automatically purged.
const MAX_AGE_MS = 7 * (1000 * 60 * 60 * 24);

interface Deleted {
  // what deleted state is
  deleted: boolean;
  // when deleted state set
  time: number;
}

interface Backend {
  // who has it opened -- the compute_server_id (0 for project)
  id: number;
  // when they last reported having it opened
  time: number;
}

// IMPORTANT: if you add/change any fields below, be sure to update
// the merge conflict function!
export interface KVEntry {
  // a web browser has the file open at this point in time (in ms)
  time?: number;
  // if the file was removed from disk (and not immmediately written back),
  // then deleted gets set to the time when this happened (in ms since epoch)
  // and the file is closed on the backend.  It won't be re-opened until
  // either (1) the file is created on disk again, or (2) deleted is cleared.
  // Note: the actual time here isn't really important -- what matter is the number
  // is nonzero.  It's just used for a display to the user.
  // We store the deleted state *and* when this was set, so that in case
  // of merge conflict we can do something sensible.
  deleted?: Deleted;

  // if file is actively opened on a compute server, then it sets
  // this entry.  Right when it closes the file, it clears this.
  // If it gets killed/broken and doesn't have a chance to clear it, then
  // backend.time can be used to decide this isn't valid.
  backend?: Backend;
}

function resolveMergeConflict(local: KVEntry, remote: KVEntry): KVEntry {
  const time = mergeTime(remote?.time, local?.time);
  const deleted = mergeDeleted(remote?.deleted, local?.deleted);
  const backend = mergeBackend(remote?.backend, local?.backend);
  return {
    time,
    deleted,
    backend,
  };
}

export interface Entry extends KVEntry {
  // path to file relative to HOME
  path: string;
}

function mergeTime(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  // time of interest should clearly always be the largest known value so far.
  if (a == null && b == null) {
    return undefined;
  }
  return Math.max(a ?? 0, b ?? 0);
}

function mergeDeleted(a: Deleted | undefined, b: Deleted | undefined) {
  if (a == null) {
    return b;
  }
  if (b == null) {
    return a;
  }
  // now both a and b are not null, so some merge is needed: we
  // use last write wins.
  return a.time >= b.time ? a : b;
}

function mergeBackend(a: Backend | undefined, b: Backend | undefined) {
  if (a == null) {
    return b;
  }
  if (b == null) {
    return a;
  }
  // now both a and b are not null, so some merge is needed: we
  // use last write wins.
  // NOTE: This should likely not happen or only happen for a moment and
  // would be worrisome, but quickly sort itself out.
  return a.time >= b.time ? a : b;
}

interface Options {
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
  private noCache?: boolean;
  private noAutosave?: boolean;
  private dkv?: DKV;
  public state: "disconnected" | "connected" | "closed" = "disconnected";

  constructor({ project_id, noAutosave, noCache }: Options) {
    super();
    if (!project_id) {
      throw Error("project_id must be specified");
    }
    this.project_id = project_id;
    this.noAutosave = noAutosave;
    this.noCache = noCache;
  }

  private setState = (state: State) => {
    this.state = state;
    this.emit(state);
  };

  init = async () => {
    const d = await dkv<KVEntry>({
      name: "open-files",
      project_id: this.project_id,
      limits: {
        max_age: MAX_AGE_MS,
      },
      noAutosave: this.noAutosave,
      noCache: this.noCache,
      merge: ({ local, remote }) => resolveMergeConflict(local, remote),
    });
    this.dkv = d;
    d.on("change", ({ key: path }) => {
      const entry = this.get(path);
      if (entry != null) {
        // not deleted and timestamp is set:
        this.emit("change", entry as Entry);
      }
    });
    // ensure clock is synchronized
    await getSkew();
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
    delete this.project_id;
  };

  private getDkv = () => {
    const { dkv } = this;
    if (dkv == null) {
      throw Error("closed");
    }
    return dkv;
  };

  private set = (path, entry: KVEntry) => {
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
    const time = getTime();
    this.set(path, {
      ...cur,
      time,
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
    this.set(path, {
      ...dkv.get(path),
      deleted: { deleted: true, time: getTime() },
    });
  };

  isDeleted = (path: string) => {
    return !!this.getDkv().get(path)?.deleted?.deleted;
  };

  setNotDeleted = (path: string) => {
    const dkv = this.getDkv();
    this.set(path, {
      ...dkv.get(path),
      deleted: { deleted: false, time: getTime() },
    });
  };

  // set that id is the backend with the file open.
  // This should be called by that backend periodically
  // when it has the file opened.
  setBackend = (path: string, id: number) => {
    const dkv = this.getDkv();
    this.set(path, {
      ...dkv.get(path),
      backend: { id, time: getTime() },
    });
  };

  // get current backend that has file opened.
  getBackend = (path: string): Backend | undefined => {
    return this.getDkv().get(path)?.backend;
  };

  // ONLY if backend for path is currently set to id, then clear
  // the backend field.
  setNotBackend = (path: string, id: number) => {
    const dkv = this.getDkv();
    const cur = { ...dkv.get(path) };
    if (cur?.backend?.id == id) {
      delete cur.backend;
      this.set(path, cur);
    }
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
