/*
Create a singleton websocket connection directly to a particular project.
*/

import { reuseInFlight } from "async-await-utils/hof";
import { API } from "./api";
import { retry_until_success } from "../../frame-editors/generic/async-utils";

const connections = {};

async function connection_to_project0(project_id: string): Promise<any> {
  if (project_id == null || project_id.length != 36) {
    throw Error(`project_id (="${project_id}") must be a valid uuid`);
  }
  if (connections[project_id] !== undefined) {
    return connections[project_id];
  }
  const window0 = (global as any).window as any; // global part is so this also compiles on node.js.
  const url: string = `${
    window0.app_base_url
  }/${project_id}/raw/.smc/primus.js`;

  await retry_until_success({
    f: async function() {
      console.log(`reading primus.js from ${project_id}...`);
      await $.getScript(url);
      console.log("success!");
    },
    max_time: 120000
  });

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
    conn.verbose = false;
    return conn;
  } finally {
    // Restore the global Primus, no matter what.
    window0.Primus = Primus0;
  }
}

export const connection_to_project = reuseInFlight(connection_to_project0);

export function disconnect_from_project(project_id: string): void {
  console.log(`conn ${project_id} -- disconnect`);
  const conn = connections[project_id];
  if (conn === undefined) {
    return;
  }
  // TODO: maybe go through and fail any outstanding api calls?
  conn.destroy();
  delete conn.api;
  delete connections[project_id];
}
