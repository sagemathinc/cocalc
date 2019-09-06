// This listens to `postMessage`'s and dispatches actions accordingly.
// For security reasons, this is very restrictive, involves extra checks, and only a selected set of origins is allowed
//
// TODO:
// * some aspects of webapp are configured via a configuration endpoint. Use it to set the allowed origins

import { redux } from "./app-framework";
import { is_valid_uuid_string } from "../smc-util/misc2";
import { Map, List } from "immutable";

var initialized = false;

const ALLOWED: readonly string[] = Object.freeze<string>([
  ".minervaproject.com",
  ".kgi.com",
  "dev.harald.schil.ly"
]);

interface ConnectionStatus {
  quality?: "good" | "flaky" | "bad";
  status?: string;
  status_time?: number;
  ping?: number;
}

interface Reply {
  status: "done" | "ack" | "error";
  connection?: ConnectionStatus;
  mesg?: string;
  action?: string;
  path?: string;
  project_id?: string;
  open_files?: object;
}

function connection_status(): ConnectionStatus | undefined {
  const page_store = redux.getStore("page") as any;
  if (page_store == null) return;
  return {
    quality: page_store.get("connection_quality") || "good",
    status: page_store.get("connection_status"),
    status_time: page_store.get("last_status_time"),
    ping: page_store.get("avgping")
  };
}

function open_projects(): List<string> | undefined {
  const projects_store = redux.getStore("projects");
  if (projects_store == null) return;
  return projects_store.get("open_projects");
}

function close_all_files() {
  const op = open_projects();
  const page_actions = redux.getActions("page") as any;
  if (op == null || page_actions == null) return;
  op.map(project_id => {
    const pa = redux.getProjectActions(project_id);
    pa.close_all_files();
    page_actions.close_project_tab(project_id);
  });
}

function all_opened_files(): undefined | object {
  const op = open_projects();
  if (op == null) return;
  const all_files = Map(
    op.map(project_id => {
      const ps = redux.getProjectStore(project_id);
      const files = ps
        .get("open_files")
        .keySeq()
        .toArray();
      return [project_id, files];
    })
  );
  return all_files.filter(files => files.length > 0).toJS();
}

function block_origin(mesg): boolean {
  for (const allowed of ALLOWED) {
    if (mesg.origin.endsWith(allowed)) return false;
  }
  return true;
}

async function process_message(mesg) {
  // NOTE: all kinds of messages might come in. e.g. there is the react
  // debugger in chrome's dev console. it has cocalc.com as origin.
  // it's ignored, because we only allow certain external domains here.

  //console.log(
  //  `comm::process_message from '${mesg.origin}' with data=`,
  //  mesg.data
  //);

  // check origin
  if (block_origin(mesg)) {
    // console.log(`Origin '${mesg.origin}' is blocked.`);
    return;
  }

  // only allow objects as data payloads
  const data = mesg.data;

  // use this little helper to send a reply.
  // at minimum, acknowledge the incoming message.
  const reply = (data: Reply) => {
    mesg.source.postMessage(data, mesg.origin);
  };

  if (typeof data !== "object") {
    reply({ status: "error", mesg: `The payload "data" must be an object` });
    return;
  }

  const { action } = data;
  switch (action) {
    case "open":
      const { project_id, path } = data;
      if (!is_valid_uuid_string(project_id)) {
        reply({ status: "error", mesg: `invalid project_id='${project_id}'` });
      } else if (path == null || typeof path !== "string") {
        reply({
          status: "error",
          mesg: `invalid path, it must be a string`
        });
      } else {
        const actions = redux.getProjectActions(project_id);
        const opts = {
          path: path,
          foreground: true,
          foreground_project: true,
          ignore_kiosk: true,
          change_history: false
        };
        try {
          reply({ status: "ack", action, path, project_id });
          await actions.open_file(opts);
          reply({ status: "done", action, path, project_id });
        } catch (err) {
          reply({
            status: "error",
            action,
            path,
            project_id,
            mesg: err.toString()
          });
        }
      }
      break;

    case "status":
      // TODO reply with an "elaborate" status message, e.g. list each project ID, did it load (true/false), ...
      reply({
        status: "done",
        connection: connection_status(),
        open_files: all_opened_files() || {}
      });
      break;

    case "closeall":
      // this closes all open editors and projects.
      // the "kiosk mode" banner should appear again.
      try {
        close_all_files();
        reply({ status: "done", mesg: "all files are closed" });
      } catch (err) {
        reply({ status: "error", mesg: err.toString() });
      }
      break;

    default:
      const err = `Unknown action '${action}'`;
      console.warn(err);
      reply({ status: "error", mesg: err });
  }
}

export function init() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("message", process_message, false);
}
