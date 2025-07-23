/*

Used mainly from a browser client frontend to manage what compute server
is used to edit a given file.

Access this in the browser for the project you have open:

> m = await cc.client.conat_client.computeServerManager({project_id:cc.current().project_id})

*/

import { dkv, type DKV } from "@cocalc/conat/sync/dkv";
import { EventEmitter } from "events";
import { once, until } from "@cocalc/util/async-utils";

type State = "init" | "connected" | "closed";

export interface Info {
  // id = compute server where this path should be opened
  id: number;
}

export interface Options {
  project_id: string;
  noAutosave?: boolean;
  noCache?: boolean;
}

export function computeServerManager(options: Options) {
  return new ComputeServerManager(options);
}

export class ComputeServerManager extends EventEmitter {
  private dkv?: DKV<Info>;
  private options: Options;
  public state: State = "init";

  constructor(options: Options) {
    super();
    this.options = options;
    // It's reasonable to have many clients, e.g., one for each open file
    this.setMaxListeners(100);
    this.init();
  }

  waitUntilReady = async () => {
    if (this.state == "closed") {
      throw Error("closed");
    } else if (this.state == "connected") {
      return;
    }
    await once(this, "connected");
  };

  save = async () => {
    await this.dkv?.save();
  };

  private initialized = false;
  init = async () => {
    if (this.initialized) {
      throw Error("init can only be called once");
    }
    this.initialized = true;
    await until(
      async () => {
        if (this.state != "init") {
          return true;
        }
        const d = await dkv<Info>({
          name: "compute-server-manager",
          ...this.options,
        });
        if (this.state == ("closed" as any)) {
          d.close();
          return true;
        }
        this.dkv = d;
        d.on("change", this.handleChange);
        this.setState("connected");
        return true;
      },
      {
        start: 3000,
        decay: 1.3,
        max: 15000,
        log: (...args) =>
          console.log(
            "WARNING: issue creating compute server manager",
            ...args,
          ),
      },
    );
  };

  private handleChange = ({ key: path, value, prev }) => {
    this.emit("change", {
      path,
      id: value?.id,
      prev_id: prev?.id,
    });
  };

  close = () => {
    // console.log("close compute server manager", this.options);
    if (this.dkv != null) {
      this.dkv.removeListener("change", this.handleChange);
      this.dkv.close();
      delete this.dkv;
    }
    this.setState("closed");
    this.removeAllListeners();
  };

  private setState = (state: State) => {
    this.state = state;
    this.emit(state);
  };

  private getDkv = () => {
    if (this.dkv == null) {
      const message = `compute server manager not initialized -- in state '${this.state}'`;
      console.warn(message);
      throw Error(message);
    }
    return this.dkv;
  };

  set = (path, id) => {
    const kv = this.getDkv();
    if (!id) {
      kv.delete(path);
      return;
    }
    kv.set(path, { id });
  };

  delete = (path) => {
    this.getDkv().delete(path);
  };

  get = (path) => this.getDkv().get(path)?.id;

  getAll = () => {
    return this.getDkv().getAll();
  };

  // Async API that doesn't assume manager has been initialized, with
  // very long names.  Used in the frontend.

  // Call this if you want the compute server with given id to
  // connect and handle being the server for the given path.
  connectComputeServerToPath = async ({
    path,
    id,
  }: {
    path: string;
    id: number;
  }) => {
    try {
      await this.waitUntilReady();
    } catch {
      return;
    }
    this.set(path, id);
  };

  // Call this if you want no compute servers to provide the backend server
  // for given path.
  disconnectComputeServer = async ({ path }: { path: string }) => {
    try {
      await this.waitUntilReady();
    } catch {
      return;
    }
    this.delete(path);
  };

  // Returns the explicitly set server id for the given
  // path, if one is set. Otherwise, return undefined
  // if nothing is explicitly set for this path (i.e., usually means home base).
  getServerIdForPath = async (path: string): Promise<number | undefined> => {
    try {
      await this.waitUntilReady();
    } catch {
      return;
    }
    return this.get(path);
  };

  // Get the server ids (as a map) for every file and every directory contained in path.
  // NOTE/TODO: this just does a linear search through all paths with a server id; nothing clever.
  getServerIdForSubtree = async (
    path: string,
  ): Promise<{ [path: string]: number }> => {
    await this.waitUntilReady();
    if (this.state == "closed") {
      throw Error("closed");
    }
    const kv = this.getDkv();
    const v: { [path: string]: number } = {};
    const slash = path.endsWith("/") ? path : path + "/";
    const x = kv.getAll();
    for (const p in x) {
      if (p == path || p.startsWith(slash)) {
        v[p] = x[p].id;
      }
    }
    return v;
  };
}
