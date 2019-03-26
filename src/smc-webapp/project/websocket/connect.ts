/*
Create a singleton websocket connection directly to a particular project.
*/

import { reuseInFlight } from "async-await-utils/hof";
import { API } from "./api";
const {
  callback2,
  once,
  retry_until_success
} = require("smc-util/async-utils"); // so also works on backend.

import { callback } from "awaiting";
import { /* getScript*/ ajax, globalEval } from "jquery";

const { webapp_client } = require("../../webapp_client");
const { redux } = require("../../app-framework");

import { set_project_websocket_state, WebsocketState } from "./websocket-state";

const connections = {};

// This is a horrible temporary hack to ensure that we do not load two global Primus
// client libraries at the same time, with one overwriting the other with the URL
// of the target, hence causing multiple projects to have the same websocket.
// I'm too tired to do this right at the moment.
let READING_PRIMUS_JS = false;

async function start_project(project_id: string) {
  // also check if the project is supposedly running and if
  // not wait for it to be.
  const projects = redux.getStore("projects");
  if (projects == null) {
    throw Error("projects store must exist");
  }

  if (projects.get_state(project_id) != "running") {
    // Encourage project to start running, if it isn't already...
    await callback2(webapp_client.touch_project, { project_id });
    if (projects.get_my_group(project_id) == "admin") {
      // must be viewing as admin, so can't start as below.  Just touch and be done.
      return;
    }
    await callback2(projects.wait, {
      until: () => projects.get_state(project_id) == "running"
    });
  }
}

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

  // So that the store reflects that we are not connected but are trying.
  set_project_websocket_state(project_id, "offline");

  await retry_until_success({
    // log: console.log,
    f: async function() {
      if (READING_PRIMUS_JS) {
        throw Error("currently reading one already");
      }

      if (!webapp_client.is_signed_in()) {
        // At least wait until main client is signed in, since nothing
        // will work until that is the case anyways.
        await once(webapp_client, "signed_in");
      }

      await start_project(project_id);

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
    start_delay: 1000,
    max_delay: 15000, // do not make too aggressive or it DDOS proxy server
    factor: 1.3,
    desc: "connecting to project"
    //log: (...x) => {
    //  console.log("retry primus:", ...x);
    //}
  });

  // This dance is because evaling primus_js sets window.Primus.
  // However, we don't want to overwrite the usual global window.Primus.
  const conn = (connections[project_id] = Primus.connect({
    reconnect: {
      max: 30000,  // do not make too aggressive or it DDOS proxy server
      min: 3000,
      factor: 1.5,
      retries: Infinity
    }
  }));
  conn.api = new API(conn, project_id);
  conn.verbose = false;

  // Given conn a state API, which is very handy for my use.
  // This both emits something (useful for sync and other code),
  // and sets information in the projects store (useful for UI).

  // And also some logging to the console about what is
  // going on in some cases.

  function update_state(state: WebsocketState): void {
    if (conn.state == state) {
      return; // nothing changed, so no need to set or emit.
    }
    console.log(
      `project websocket: state='${state}', project_id='${project_id}'`
    );
    conn.state = state;
    conn.emit("state", state);
    set_project_websocket_state(project_id, state);
  }
  update_state("offline"); // starts offline

  conn.on("open", () => {
    update_state("online");
  });

  /*
  CRITICAL: do NOT consider this as online -- conn emits
  online before open, and this causes havoc with synctable.
  conn.on("online", () => {
    update_state("online");
  });*/

  conn.on("offline", () => {
    update_state("offline");
  });

  conn.on("destroy", () => {
    update_state("destroyed");
  });

  conn.on("reconnect", async function() {
    console.log(`project websocket: reconnecting to '${project_id}'...`);
    update_state("offline");
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
