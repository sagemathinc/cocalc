/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create a singleton websocket connection directly to a particular project.

This is something that is annoyingly NOT supported by Primus.
Many projects (perhaps dozens) can be open for a given client
wat once, and hence we make many Primus websocket connections
simultaneously to the same domain.  It does work, but not without an ugly hack.
*/

import { join } from "path";
import { reuseInFlight } from "async-await-utils/hof";
import { API } from "./api";
const {
  callback2,
  once,
  retry_until_success,
} = require("smc-util/async-utils"); // so also works on backend.

import { callback } from "awaiting";
import { /* getScript*/ ajax, globalEval } from "jquery";

import { redux } from "../../app-framework";

import { set_project_websocket_state, WebsocketState } from "./websocket-state";
import { webapp_client } from "../../webapp-client";
import { allow_project_to_run } from "../client-side-throttle";

const connections = {};

// This is a horrible temporary hack to ensure that we do not load two global Primus
// client libraries at the same time, with one overwriting the other with the URL
// of the target, hence causing multiple projects to have the same websocket.
let READING_PRIMUS_JS = false;

async function wait_for_project_to_start(project_id: string) {
  if (!allow_project_to_run(project_id)) {
    throw Error("not allowing right now");
  }
  // also check if the project is supposedly running and if
  // not wait for it to be.
  const projects = redux.getStore("projects");
  if (projects == null) {
    throw Error("projects store must exist");
  }

  if (!projects.is_collaborator(project_id)) {
    // wait below not useful:
    return;
  }
  await callback2(projects.wait, {
    until: () => projects.get_state(project_id) == "running",
  });
}

async function connection_to_project0(project_id: string): Promise<any> {
  if (project_id == null || project_id.length != 36) {
    throw Error(`project_id (="${project_id}") must be a valid uuid`);
  }
  if (connections[project_id] !== undefined) {
    return connections[project_id];
  }

  function log(..._args): void {
    // Uncomment for very verbose logging/debugging...
    // console.log(`project websocket("${project_id}")`, ..._args);
  }
  log("connecting...");
  const window0: any = (global as any).window as any; // global part is so this also compiles on node.js.
  const url: string = join(
    window0.app_base_path,
    project_id,
    "raw/.smc/primus.js"
  );

  const Primus0 = window0.Primus; // the global primus
  let Primus;

  // So that the store reflects that we are not connected but are trying.
  set_project_websocket_state(project_id, "offline");

  const MAX_AJAX_TIMEOUT_MS: number = 3500;

  async function get_primus(do_eval: boolean) {
    let timeout: number = 750;
    await retry_until_success({
      // log: console.log,
      f: async function () {
        if (do_eval && READING_PRIMUS_JS) {
          throw Error("currently reading one already");
        }

        if (!webapp_client.is_signed_in()) {
          // At least wait until main client is signed in, since nothing
          // will work until that is the case anyways.
          await once(webapp_client, "signed_in");
        }

        log("wait_for_project_to_start...");
        await wait_for_project_to_start(project_id);
        log("wait_for_project_to_start: done");

        // Now project is thought to be running, so maybe this will work:
        try {
          if (do_eval) {
            READING_PRIMUS_JS = true;
          }

          /*
          We use a timeout in the ajax call before, since while the project is
          starting up the call ends up taking a LONG time to "Stall out" due to settings
          in a proxy server somewhere along the way.  This makes the project start time
          (i.e., how long until websocket is working) seem really slow for no good reason.
          Instead, we keep retrying the primus.js GET request pretty aggressively until
          success.
          NOTE: there is the real potential of very slow 3G clients not being able to complete the
          GET, which is why we increase it each time up to MAX_AJAX_TIMEOUT_MS.
          */

          const load_primus = (cb) => {
            ajax({
              timeout,
              type: "GET",
              url,
              // text, in contrast to "script", doesn't eval it -- we do that!
              dataType: "text",
              error: () => {
                cb("ajax error -- try again");
              },
              success: async function (data) {
                // console.log("success. data:", data.slice(0, 100));
                if (data.charAt(0) !== "<") {
                  if (do_eval) {
                    await globalEval(data);
                  }
                  cb();
                } else {
                  cb("wrong data -- try again");
                }
              },
            });
          };
          log(
            `load_primus: attempt to get primus.js with timeout=${timeout}ms and do_eval=${do_eval}`
          );
          await callback(load_primus);
          log("load_primus: done");

          if (do_eval) {
            Primus = window0.Primus;
            window0.Primus = Primus0; // restore global primus
          }
        } finally {
          if (do_eval) {
            READING_PRIMUS_JS = false;
          }
          timeout = Math.min(timeout * 1.2, MAX_AJAX_TIMEOUT_MS);
          //console.log("success!");
        }
      },
      start_delay: 250,
      max_delay: 2000, // do not make too aggressive or it DDOS proxy server;
      // but also not too slow since project startup will feel slow to user.
      factor: 1.2,
      desc: "connecting to project",
      log: (...x) => {
        log("retry primus:", ...x);
      },
    });

    log("got primus.js successfully");
  }
  await get_primus(true);

  // This dance is because evaling primus_js sets window.Primus.
  // However, we don't want to overwrite the usual global window.Primus.
  // Also, we use {strategy:false} to **completely disable** all
  // automatic reconnect logic (see https://github.com/primus/primus#strategy),
  // because of recent bugs (optimizations?) in web browsers that make it
  // so after a certain number of failed reconnect attempts, they totally BREAK
  // and you have to restart your browser complete (not good).
  const conn = (connections[project_id] = Primus.connect({
    strategy: false,
    manual: true,
  }));
  conn.open();

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
    //console.log(
    //  `project websocket: state='${state}', project_id='${project_id}'`
    //);
    conn.state = state;
    conn.emit("state", state);
    set_project_websocket_state(project_id, state);
  }
  update_state("offline"); // starts offline

  conn.on("open", () => {
    log("online!");
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

  // Instead of using the primus reconnect logic, which just keeps
  // attempting websocket connections (which turns out to be very bad
  // for modern browsers!), we use our own strategy.
  conn.on("end", async function () {
    log(`project websocket: reconnecting to '${project_id}'...`);
    if (conn.api == null) return; // done with this connection
    update_state("offline");
    await get_primus(false);
    if (conn.api == null) return; // done with this connection
    conn.open();
  });

  return conn;
}

export const connection_to_project = reuseInFlight(connection_to_project0);

export function disconnect_from_project(project_id: string): void {
  const conn = connections[project_id];
  if (conn === undefined) {
    return;
  }
  // TODO: maybe go through and fail any outstanding api calls?
  conn.destroy();
  delete conn.api;
  delete connections[project_id];
}

export function disconnect_from_all_projects(): void {
  for (const project_id in connections) {
    disconnect_from_project(project_id);
  }
}
