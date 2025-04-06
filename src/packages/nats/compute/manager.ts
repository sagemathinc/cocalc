/*

Used mainly from a browser client frontend to manage what compute server
is used to edit a given file.

Access this in the browser for the project you have open:

> m = await cc.client.nats_client.computeServerManager({project_id:cc.current().project_id})

*/

import { dkv, type DKV } from "@cocalc/nats/sync/dkv";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { EventEmitter } from "events";

type State = "init" | "connected" | "closed";

export interface Info {
  // compute server where this path should be opened
  id: number;
}

export interface Options {
  project_id: string;
  noAutosave?: boolean;
  noCache?: boolean;
}

export function computeServerManager(options: Options) {
  const M = new ComputeServerManager(options);
  M.init();
  return M;
}

export class ComputeServerManager extends EventEmitter {
  private dkv?: DKV<Info>;
  private options: Options;
  private state: State = "init";

  constructor(options: Options) {
    super();
    this.options = options;
    // It's reasonable to have many clients, e.g., one for each open file
    this.setMaxListeners(100);
    this.init();
  }

  waitUntilReady = async () => {
    if (this.state == "closed") {
      throw Error("manager is closed");
    } else if (this.state == "connected") {
      return;
    }
    await this.init();
  };

  save = async () => {
    await this.dkv?.save();
  };

  init = reuseInFlight(async () => {
    try {
      const d = await dkv<Info>({
        name: "compute-server-manager",
        ...this.options,
      });
      this.dkv = d;
      d.on("change", this.handleChange);
      this.setState("connected");
    } catch (err) {
      // console.log("WARNING: issue creating compute server manager", err);
      this.close();
      throw err;
    }
  });

  private handleChange = ({ key: path, value, prev }) => {
    this.emit("change", {
      path,
      id: value?.id,
      prev_id: prev?.id,
    });
  };

  close = () => {
    // console.log("closing a compute server manager");
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
      throw Error(
        `compute server manager not initialized -- in state '${this.state}'`,
      );
    }
    return this.dkv;
  };

  // Modern sync API:  used in backend.

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
    await this.waitUntilReady();
    this.set(path, id);
  };

  // Call this if you want no compute servers to provide the backend server
  // for given path.
  disconnectComputeServer = async ({ path }: { path: string }) => {
    await this.waitUntilReady();
    this.delete(path);
  };

  // Returns the explicitly set server id for the given
  // path, if one is set. Otherwise, return undefined
  // if nothing is explicitly set for this path (i.e., usually means home base).
  getServerIdForPath = async (path: string): Promise<number | undefined> => {
    await this.waitUntilReady();
    return this.get(path);
  };

  // Get the server ids (as a map) for every file and every directory contained in path.
  // NOTE/TODO: this just does a linear search through all paths with a server id; nothing clever.
  getServerIdForSubtree = async (
    path: string,
  ): Promise<{ [path: string]: number }> => {
    await this.waitUntilReady();
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
