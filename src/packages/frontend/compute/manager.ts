/*
Client side compute servers manager

Used from a browser client frontend to manage what compute servers
are available and how they are used for a given project.
*/

import { SYNCDB_PARAMS, decodeUUIDtoNum } from "@cocalc/util/compute/manager";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import debug from "debug";

const log = debug("cocalc:frontend:compute:manager");

export class ComputeServersManager {
  private sync_db;
  private project_id;

  constructor(project_id: string) {
    this.project_id = project_id;
    this.sync_db = webapp_client.sync_db({
      project_id,
      ...SYNCDB_PARAMS,
    });
    log("created", this.project_id);
  }

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
    assertSupportedPath(path);
    this.sync_db.set({ id, path });
    this.sync_db.commit();
  };

  // Call this if you want no compute servers to provide the backend server
  // for given path.
  disconnectComputeServer = ({ path }: { path: string }) => {
    assertSupportedPath(path);
    this.sync_db.delete({ path });
    this.sync_db.commit();
  };

  // For interactive debugging -- display in the console how things are configured.
  showStatus = () => {
    console.log(JSON.stringify(this.sync_db.get().toJS(), undefined, 2));
  };
}

function assertSupportedPath(path: string) {
  if (!path.endsWith(".ipynb") && !path.endsWith(".term")) {
    throw Error("only ipynb and term paths are supported");
  }
  return true;
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
