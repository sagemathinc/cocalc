/*
Create a singleton websocket connection directly to a particular project.
*/

import { reuseInFlight } from "async-await-utils/hof";
import { API } from "./api";
import { retry_until_success } from "../../frame-editors/generic/async-utils";

import { getScript } from "jquery";

const connections = {};

// This is a horrible temporary hack to ensure that we do not load two global Primus
// client libraries at the same time, with one overwriting the other with the URL
// of the target, hence causing multiple projects to have the same websocket.
// I'm too tired to do this right at the moment.
let READING_PRIMUS_JS = false;

async function connection_to_project0(project_id: string): Promise<any> {
  if (project_id == null || project_id.length != 36) {
    throw Error(`project_id (="${project_id}") must be a valid uuid`);
  }
  if (connections[project_id] !== undefined) {
    return connections[project_id];
  }
  console.log(`project websocket: connecting to ${project_id}...`);
  const window0: any = (global as any).window as any; // global part is so this also compiles on node.js.
  const url: string = `${
    window0.app_base_url
  }/${project_id}/raw/.smc/primus.js`;

  const Primus0 = window0.Primus; // the global primus
  let Primus;

  await retry_until_success({
    f: async function() {
      if (READING_PRIMUS_JS) {
        throw Error("currently reading one already");
      }
      try {
        READING_PRIMUS_JS = true;
        //console.log(`reading primus.js from ${project_id}...`);
        await getScript(url);
        Primus = window0.Primus;
        window0.Primus = Primus0; // restore global primus
      } finally {
        READING_PRIMUS_JS = false;
        //console.log("success!");
      }
    },
    max_time: 1000 * 60 * 30,
    start_delay: 250,
    max_delay: 1500,
    factor: 1.2
  });

  // This dance is because evaling primus_js sets window.Primus.
  // However, we don't want to overwrite the usual global window.Primus.
  const conn = (connections[project_id] = Primus.connect({
    reconnect: {
      max: 3000,
      min: 1000,
      factor: 1.3,
      retries: 1000
    }
  }));
  conn.api = new API(conn);
  conn.verbose = false;
  conn.on("open", function() {
    console.log(`project websocket: connected to ${project_id}`);
  });
  conn.on("reconnect", function() {
    console.log(`project websocket: trying to reconnect to ${project_id}`);
  });
  return conn;
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
