/*
- it connects to the project and registers as a compute-server (sending its id number).
- it receives messages from project
- one of the messages is "connect to this path", where the path ends in .term or .ipynb
- it handles that by launching the command to create the connection.
- by default it just launches it in the same process, but it can configured to instead create a docker container to handle the connection
- another message is "disconnect from this path".  That closes the connection or stops the docker container.
- compute server
*/

import SyncClient from "@cocalc/sync-client";
import { SYNCDB_PARAMS } from "@cocalc/util/compute/manager";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("compute:manager");

interface Options {
  project_id: string;
  // the id number of this manager, should be the id in the database from the compute_servers table.
  compute_server_id: number;
}

export function manager({ project_id, compute_server_id }: Options) {
  return new Manager({ project_id, compute_server_id });
}

class Manager {
  private sync;
  private compute_server_id: number;

  constructor({ project_id, compute_server_id }: Options) {
    this.compute_server_id = compute_server_id;
    const client = new SyncClient({ project_id });
    console.log(SYNCDB_PARAMS);
    this.sync = client.sync_client.sync_db({
      project_id,
      ...SYNCDB_PARAMS,
    });
    this.sync.on("ready", () => {
      this.log("sync is ready");
      this.setState("ready");
    });
  }

  setState = (state) => {
    this.log("setState", state);
    this.sync.set({
      id: this.compute_server_id,
      table: "server-state",
      state,
      time: Date.now(),
    });
    this.sync.commit();
  };

  log = (func, ...args) => {
    logger.debug(`Manager.${func}`, ...args);
  };
}
