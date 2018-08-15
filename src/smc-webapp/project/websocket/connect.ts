/*
Create a singleton websocket connection directly to a particular project.
*/

import { reuseInFlight } from "async-await-utils/hof";
import { API } from "./api";

const connections = {};

async function connection_to_project0(project_id: string): Promise<any> {
  if (connections[project_id] !== undefined) {
    return connections[project_id];
  }
  const window0 = window as any;
  const url: string = `${
    window0.app_base_url
  }/${project_id}/raw/.smc/primus.js`;
  await $.getScript(url);

  // This dance is because evaling primus_js sets window.Primus.
  // However, we don't want to overwrite the usual global window.Primus.
  const Primus0 = window0.Primus; // so the global primus
  try {
    const conn = (connections[project_id] = window0.Primus.connect({
      reconnect: {
        max: 10000,
        min: 1000,
        factor: 1.3,
        retries: 1000
      }
    }));
    conn.api = new API(conn);
    conn.verbose = false
    conn.on("close", function() {
      delete conn.api;
      delete connections[project_id];
    });
    return conn;
  } finally {
    // Restore the global Primus, no matter what.
    window0.Primus = Primus0;
  }
}

export const connection_to_project = reuseInFlight(connection_to_project0);
