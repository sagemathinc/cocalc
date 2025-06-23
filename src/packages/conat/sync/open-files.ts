/*
Keep track of open files.

We use the "dko" distributed key:value store because of the potential of merge
conflicts, e.g,. one client changes the compute server id and another changes
whether a file is deleted.  By using dko, only the field that changed is sync'd
out, so we get last-write-wins on the level of fields.

WARNINGS:
An old version use dkv with merge conflict resolution, but with multiple clients
and the project, feedback loops or something happened and it would start getting
slow -- basically, merge conflicts could take a few seconds to resolve, which would
make opening a file start to be slow.  Instead we use DKO data type, where fields
are treated separately atomically by the storage system.  A *subtle issue* is
that when you set an object, this is NOT treated atomically.  E.g., if you 
set 2 fields in a set operation, then 2 distinct changes are emitted as the
two fields get set. 

DEVELOPMENT:

Change to packages/backend, since packages/conat doesn't have a way to connect:

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
import { dko, type DKO } from "@cocalc/conat/sync/dko";
import { EventEmitter } from "events";
import getTime, { getSkew } from "@cocalc/conat/time";

// info about interest in open files (and also what was explicitly deleted) older
// than this is automatically purged.
const MAX_AGE_MS = 1000 * 60 * 60 * 24;

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

  // if file is actively opened on a compute server/project, then it sets
  // this entry.  Right when it closes the file, it clears this.
  // If it gets killed/broken and doesn't have a chance to clear it, then
  // backend.time can be used to decide this isn't valid.
  backend?: Backend;

  // optional information
  doctype?;
}

export interface Entry extends KVEntry {
  // path to file relative to HOME
  path: string;
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
  private kv?: DKO;
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

  private initialized = false;
  init = async () => {
    if (this.initialized) {
      throw Error("init can only be called once");
    }
    this.initialized = true;
    const d = await dko<KVEntry>({
      name: "open-files",
      project_id: this.project_id,
      config: {
        max_age: MAX_AGE_MS,
      },
      noAutosave: this.noAutosave,
      noCache: this.noCache,
      noInventory: true,
    });
    this.kv = d;
    d.on("change", this.handleChange);
    // ensure clock is synchronized
    await getSkew();
    this.setState("connected");
  };

  private handleChange = ({ key: path }) => {
    const entry = this.get(path);
    if (entry != null) {
      // not deleted and timestamp is set:
      this.emit("change", entry as Entry);
    }
  };

  close = () => {
    if (this.kv == null) {
      return;
    }
    this.setState("closed");
    this.removeAllListeners();
    this.kv.removeListener("change", this.handleChange);
    this.kv.close();
    delete this.kv;
    // @ts-ignore
    delete this.project_id;
  };

  private getKv = () => {
    const { kv } = this;
    if (kv == null) {
      throw Error("closed");
    }
    return kv;
  };

  private set = (path, entry: KVEntry) => {
    this.getKv().set(path, entry);
  };

  // When a client has a file open, they should periodically
  // touch it to indicate that it is open.
  // updates timestamp and ensures open=true.
  touch = (path: string, doctype?) => {
    if (!path) {
      throw Error("path must be specified");
    }
    const kv = this.getKv();
    const cur = kv.get(path);
    const time = getTime();
    if (doctype) {
      this.set(path, {
        ...cur,
        time,
        doctype,
      });
    } else {
      this.set(path, {
        ...cur,
        time,
      });
    }
  };

  setError = (path: string, err?: any) => {
    const kv = this.getKv();
    if (!err) {
      const current = { ...kv.get(path) };
      delete current.error;
      this.set(path, current);
    } else {
      const current = { ...kv.get(path) };
      current.error = { time: Date.now(), error: `${err}` };
      this.set(path, current);
    }
  };

  setDeleted = (path: string) => {
    const kv = this.getKv();
    this.set(path, {
      ...kv.get(path),
      deleted: { deleted: true, time: getTime() },
    });
  };

  isDeleted = (path: string) => {
    return !!this.getKv().get(path)?.deleted?.deleted;
  };

  setNotDeleted = (path: string) => {
    const kv = this.getKv();
    this.set(path, {
      ...kv.get(path),
      deleted: { deleted: false, time: getTime() },
    });
  };

  // set that id is the backend with the file open.
  // This should be called by that backend periodically
  // when it has the file opened.
  setBackend = (path: string, id: number) => {
    const kv = this.getKv();
    this.set(path, {
      ...kv.get(path),
      backend: { id, time: getTime() },
    });
  };

  // get current backend that has file opened.
  getBackend = (path: string): Backend | undefined => {
    return this.getKv().get(path)?.backend;
  };

  // ONLY if backend for path is currently set to id, then clear
  // the backend field.
  setNotBackend = (path: string, id: number) => {
    const kv = this.getKv();
    const cur = { ...kv.get(path) };
    if (cur?.backend?.id == id) {
      delete cur.backend;
      this.set(path, cur);
    }
  };

  getAll = (): Entry[] => {
    const x = this.getKv().getAll();
    return Object.keys(x).map((path) => {
      return { ...x[path], path };
    });
  };

  get = (path: string): Entry | undefined => {
    const x = this.getKv().get(path);
    if (x == null) {
      return x;
    }
    return { ...x, path };
  };

  delete = (path) => {
    this.getKv().delete(path);
  };

  clear = () => {
    this.getKv().clear();
  };

  save = async () => {
    await this.getKv().save();
  };

  hasUnsavedChanges = () => {
    return this.getKv().hasUnsavedChanges();
  };
}
