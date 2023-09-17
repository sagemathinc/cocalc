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
import { SYNCDB_PARAMS, encodeIntToUUID } from "@cocalc/util/compute/manager";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("compute:manager");

const STATUS_INTERVAL_MS = 15000;

interface Options {
  project_id: string;
  // the id number of this manager, should be the id in the database from the compute_servers table.
  compute_server_id: number;
}

export function manager({ project_id, compute_server_id }: Options) {
  return new Manager({ project_id, compute_server_id });
}

class Manager {
  private sync_db;

  constructor({ project_id, compute_server_id }: Options) {
    const client_id = encodeIntToUUID(compute_server_id);
    const client = new SyncClient({ project_id, client_id });
    this.sync_db = client.sync_client.sync_db({
      project_id,
      ...SYNCDB_PARAMS,
    });
    this.sync_db.on("ready", () => {
      this.log("sync is ready");
      this.reportStatus();
    });
    setInterval(this.reportStatus, STATUS_INTERVAL_MS);
  }

  reportStatus = () => {
    this.log("reportStatus");
    // todo -- will put system load and other info here too
    this.sync_db.set_cursor_locs([
      {
        status: "running",
        // fake for dev
        uptime:
          "00:04:17 up 10 days,  6:39,  0 users,  load average: 2.65, 2.74, 2.72",
      },
    ]);
  };

  log = (func, ...args) => {
    logger.debug(`Manager.${func}`, ...args);
  };
}
