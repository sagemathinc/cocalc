/*
Client side compute servers manager

Used from a browser client frontend to manage what compute servers
are available and how they are used for a given project.

When doing dev from the browser console, do:

cc.client.project_client.computeServers('...project_id...')
*/

import { SYNCDB_PARAMS, decodeUUIDtoNum } from "@cocalc/util/compute/manager";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import debug from "debug";
import { once } from "@cocalc/util/async-utils";
import { EventEmitter } from "events";
import { excludeFromComputeServer } from "@cocalc/frontend/file-associations";

const log = debug("cocalc:frontend:compute:manager");

export class ComputeServersManager extends EventEmitter {
  private sync_db;
  private project_id;

  constructor(project_id: string) {
    super();
    this.project_id = project_id;
    this.sync_db = webapp_client.sync_db({
      project_id,
      ...SYNCDB_PARAMS,
    });
    this.sync_db.on("change", () => {
      this.emit("change");
    });
    // It's reasonable to have many clients, e.g., one for each open file
    this.setMaxListeners(100);
    log("created", this.project_id);
  }

  close = () => {
    delete computeServerManagerCache[this.project_id];
    this.sync_db.close();
  };

  getComputeServers = () => {
    const servers = {};
    const cursors = this.sync_db.get_cursors().toJS();
    for (const client_id in cursors) {
      const server = cursors[client_id];
      servers[decodeUUIDtoNum(client_id)] = {
        time: server.time,
        ...server.locs[0],
      };
    }
    return servers;
  };

  // Call this if you want the compute server with given id to
  // connect and handle being the server for the given path.
  connectComputeServerToPath = ({ id, path }: { id: number; path: string }) => {
    if (id == 0) {
      this.disconnectComputeServer({ path });
      return;
    }
    assertSupportedPath(path);
    this.sync_db.set({ id, path, open: true });
    this.sync_db.commit();
  };

  // Call this if you want no compute servers to provide the backend server
  // for given path.
  disconnectComputeServer = ({ path }: { path: string }) => {
    this.sync_db.delete({ path });
    this.sync_db.commit();
  };

  // For interactive debugging -- display in the console how things are configured.
  showStatus = () => {
    console.log(JSON.stringify(this.sync_db.get().toJS(), undefined, 2));
  };

  // Returns the explicitly set server id for the given
  // path, if one is set. Otherwise, return undefined
  // if nothing is explicitly set for this path.
  getServerIdForPath = async (path: string): Promise<number | undefined> => {
    const { sync_db } = this;
    if (sync_db.get_state() == "init") {
      await once(sync_db, "ready");
    }
    if (sync_db.get_state() != "ready") {
      throw Error("syncdb not ready");
    }
    return sync_db.get_one({ path })?.get("id");
  };
}

function assertSupportedPath(path: string) {
  if (excludeFromComputeServer(path)) {
    throw Error(
      `Opening '${path}' on a compute server is not yet supported -- copy it to the project and open it there instead`,
    );
  }
}

const computeServerManagerCache: {
  [project_id: string]: ComputeServersManager;
} = {};

export const computeServers = (project_id: string) => {
  if (computeServerManagerCache[project_id]) {
    return computeServerManagerCache[project_id];
  }
  const m = new ComputeServersManager(project_id);
  computeServerManagerCache[project_id] = m;
  return m;
};

export default computeServers;
