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

interface Reply {
  status: "ok" | "error";
  connection?: "good" | "flaky";
  mesg?: string;
  path?: string;
  project_id?: string;
  open_files?: object;
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

async function process_message(mesg) {
  // TODO whitelist mesg.origin domains

  console.log(
    `comm::process_message from '${mesg.origin}' with data=`,
    mesg.data
  );

  // check origin
  let blocked = (function(): boolean {
    for (const allowed of ALLOWED) {
      if (mesg.origin.endsWith(allowed)) return false;
    }
    return true;
  })();

  if (blocked) {
    console.log(`Origin '${mesg.origin}' is blocked.`);
    return;
  }

  // check data
  const data = mesg.data;
  if (typeof data !== "object") return;

  const { action, project_id, path } = data;

  const reply = (data: Reply) => {
    mesg.source.postMessage(data, mesg.origin);
  };

  switch (action) {
    case "open":
      if (
        is_valid_uuid_string(project_id) &&
        path != null &&
        typeof path === "string"
      ) {
        const actions = redux.getProjectActions(project_id);
        const opts = {
          path: path,
          foreground: true,
          ignore_kiosk: true,
          change_history: false
        };
        await actions.open_file(opts);
        reply({ status: "ok", path, project_id });
      }
      break;

    case "status":
      // TODO reply with an "elaborate" status message, e.g. list each project ID, did it load (true/false), ...
      reply({
        status: "ok",
        connection: "good",
        open_files: all_opened_files() || {}
      });
      break;

    case "closeall":
      // this closes all open editors and projects. the "kiosk mode" banner should appear again.
      try {
        close_all_files();
        reply({ status: "ok", mesg: "all files are closed" });
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
