/*
Create a singleton websocket connection directly to a particular project.
*/

import { reuseInFlight } from "async-await-utils/hof";
import { API } from "./api";
const { callback2, once, retry_until_success } = require("smc-util/async-utils"); // so also works on backend.

import { callback } from "awaiting";
import { /* getScript*/ ajax, globalEval } from "jquery";

const { webapp_client } = require("../../webapp_client");
const { redux } = require("../../app-framework");

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

      if (!webapp_client.is_signed_in()) {
        // At least wait until main client is signed in, since nothing
        // will work until that is the case anyways.
        await once(webapp_client, "signed_in");
      }

      // also check if the project is supposedly running and if not wait for it to be.
      const projects = redux.getStore("projects");
      if (projects == null) {
        throw Error("projects store must exist");
      }

      if (projects.get_state(project_id) != "running") {
        // Encourage project to start running, if it isn't already...
        await callback2(webapp_client.touch_project, { project_id });
        await callback2(projects.wait, {
          until: () => projects.get_state(project_id) == "running"
        });
      }

      // Now project is thought to be running, so maybe this will work:

      try {
        READING_PRIMUS_JS = true;

        const load_primus = cb => {
          ajax({
            type: "GET",
            url: url,
            // text, in contrast to "script", doesn't eval it -- we do that!
            dataType: "text",
            error: () => {
              cb("ajax error -- try again");
            },
            success: async function(data) {
              // console.log("success. data:", data.slice(0, 100));
              if (data.charAt(0) !== "<") {
                await globalEval(data);
                cb();
              } else {
                cb("wrong data -- try again");
              }
            }
          });
        };
        await callback(load_primus);

        Primus = window0.Primus;
        window0.Primus = Primus0; // restore global primus
      } finally {
        READING_PRIMUS_JS = false;
        //console.log("success!");
      }
    },
    start_delay: 300,
    max_delay: 3000,
    factor: 1.2
    //log: (...x) => {
    //  console.log("retry primus:", ...x);
    //}
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
