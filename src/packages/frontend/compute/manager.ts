/*
 */

import { SYNCDB_PARAMS, decodeUUIDtoNum } from "@cocalc/util/compute/manager";
import { webapp_client } from "@cocalc/frontend/webapp-client";

class ComputeServersManager {
  private sync_db;
  private project_id;

  constructor(project_id: string) {
    this.project_id = project_id;
    this.sync_db = webapp_client.sync_db({
      project_id,
      ...SYNCDB_PARAMS,
    });
    console.log("created", this.sync_db, this.project_id);
  }

  getComputeServers() {
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
