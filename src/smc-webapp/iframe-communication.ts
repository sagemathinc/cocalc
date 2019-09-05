// This listens to `postMessage`'s and dispatches actions accordingly.
// For security reasons, this is very restrictive, involves extra checks, and only a selected set of origins is allowed
//
// TODO:
// * some aspects of webapp are configured via a configuration endpoint. Use it to set the allowed origins

import { redux } from "./app-framework";
import { is_valid_uuid_string } from "../smc-util/misc2";

var initialized = false;

const ALLOWED: readonly string[] = Object.freeze<string>([
  ".minervaproject.com",
  ".kgi.com",
  "dev.harald.schil.ly"
]);

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
        mesg.source.postMessage(
          { open: "done", path, project_id },
          mesg.origin
        );
      }
      break;

    case "status":
      // TODO reply with an "elaborate" status message, e.g. list each project ID, did it load (true/false), ...
      const status = {
        ready: true,
        connection: "ok",
        projects: { "9282d61d-8d27-4b9f-ae0f-2fc9bac64203": { ready: true } }
      };
      mesg.source.postMessage(status, mesg.origin);
      break;

    case "closeall":
      // this closes all open editors and projects. the "kiosk mode" banner should appear again.
      mesg.source.postMessage({ info: "got closeall message" }, mesg.origin);
      break;

    default:
      const msg = `Unknown action '${action}'`;
      console.warn(msg);
      mesg.source.postMessage({ error: msg }, mesg.origin);
  }
}

export function init() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("message", process_message, false);
}
