/*
 */

import { SYNCDB_PARAMS } from "@cocalc/util/compute/manager";
import { webapp_client } from "@cocalc/frontend/webapp-client";

class ComputeServerManager {
  private sync;
  private project_id;

  constructor(project_id: string) {
    this.project_id = project_id;
    this.sync = webapp_client.sync_db({
      project_id,
      ...SYNCDB_PARAMS,
    });
    console.log("created", this.sync, this.project_id);
  }
}

const managerCache: { [project_id: string]: ComputeServerManager } = {};

export const manager = (project_id: string) => {
  if (managerCache[project_id]) {
    return managerCache[project_id];
  }
  const m = new ComputeServerManager(project_id);
  managerCache[project_id] = m;
  return m;
};

// window.x = { manager };
