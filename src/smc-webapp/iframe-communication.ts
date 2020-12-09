/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This makes it possible to communicate between a host page and CoCalc in an embedded IFrame in a clean way.
//
// It listens to `postMessage`'s and dispatches actions accordingly.
// For security reasons, this is very restrictive, involves extra checks, and only a selected set of origins is allowed.

import { delay } from "awaiting";
import memoizeOne from "memoize-one";
import { redux } from "./app-framework";
import { is_valid_uuid_string } from "../smc-util/misc";
import { Map, List } from "immutable";

let initialized = false;

// all replies are of this format
interface Reply {
  status: "done" | "ack" | "error";
  connection?: ConnectionStatus;
  mesg?: string;
  action?: string;
  path?: string;
  project_id?: string;
  open_files?: object;
}

// this should give the host page a high-level view of how well the page works
interface ConnectionStatus {
  quality?: "good" | "flaky" | "bad";
  status?: string;
  status_time?: number;
  ping?: number;
}

// acquire how well cocalc is connected to the server
function connection_status(): ConnectionStatus | undefined {
  const page_store = redux.getStore("page") as any;
  if (page_store == null) return;
  return {
    quality: page_store.get("connection_quality") || "good",
    status: page_store.get("connection_status"),
    status_time: page_store.get("last_status_time"),
    ping: page_store.get("avgping"),
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
  op.map((project_id) => {
    const pa = redux.getProjectActions(project_id);
    pa.close_all_files();
    page_actions.close_project_tab(project_id);
  });
}

function all_opened_files(): undefined | object {
  const op = open_projects();
  if (op == null) return;
  const all_files = Map(
    op.map((project_id) => {
      const ps = redux.getProjectStore(project_id);
      const files = ps.get("open_files").keySeq().toArray();
      return [project_id, files];
    })
  );
  return all_files.filter((files) => files.length > 0).toJS();
}

// this gets and saves a list of allowed origin hosts.
// they're configured via site-settings (db-schema/site-defaults.ts)
const get_allowed_hosts = memoizeOne(
  async (): Promise<string[]> => {
    const customize_store = redux.getStore("customize");
    await customize_store.until_configured();
    const hosts = customize_store.get_iframe_comm_hosts();
    return hosts;
  }
);

// there are two cases: an allowed host starts with a "." or not
// a "." implies the domain and all subdomains are allowed (i.e. origin ends with it)
// ATTN what we do *not* want to match is this: bar.com is allowed, but we're embedded in foobar.com
// we also reject http:// due to being insecure.
export function block_origin(mesg, hosts: string[]): boolean {
  if (mesg.origin.startsWith("http://")) return true;
  for (const allowed of hosts) {
    if (allowed.slice(0, 1) === ".") {
      if (mesg.origin.endsWith(allowed)) return false;
      if (mesg.origin.endsWith(`https://${allowed.slice(1)}`)) return false;
    } else {
      if (mesg.origin.endsWith(`https://${allowed}`)) return false;
    }
  }
  return true;
}

async function handle_open({ data, reply }) {
  const { project_id, path } = data;
  const action = "open"; //we're handling "open"
  if (!is_valid_uuid_string(project_id)) {
    reply({ status: "error", mesg: `invalid project_id='${project_id}'` });
    return;
  }

  if (path == null || typeof path !== "string") {
    reply({
      status: "error",
      mesg: `invalid path, it must be a string`,
    });
    return;
  }

  // we're in kiosk mode and only want to open a single project
  redux.getActions("page").setState({ kiosk_project_id: project_id });

  // copied from cocalc/src/smc-webapp/file-use/util.ts
  await redux.getActions("projects").open_project({ project_id });
  await delay(0);
  const actions = redux.getProjectActions(project_id);
  if (actions == null) {
    reply({
      status: "error",
      mesg: `problem opening project ${project_id}`,
    });
    return;
  }

  const opts = {
    path: path,
    foreground: true,
    foreground_project: true,
    ignore_kiosk: true,
    change_history: false,
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
      mesg: err.toString(),
    });
  }
}

async function process_message(mesg) {
  // NOTE: all kinds of messages might come in. e.g. there is the react
  // debugger in chrome's dev console. it has cocalc.com as origin.
  // it's ignored, because we only allow certain external domains here.

  //console.log(
  //  `comm::process_message from '${mesg.origin}' with data=`,
  //  mesg.data
  //);

  // ignore messages to myself (otherwise, sending a reply causes an infinite loop)
  if (window == mesg.source) {
    return;
  }

  // check origin
  if (await block_origin(mesg, await get_allowed_hosts())) {
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

  if (data == null) {
    reply({ status: "error", mesg: `There is no payload "data"` });
    return;
  }

  if (typeof data !== "object") {
    reply({ status: "error", mesg: `The payload "data" must be an object` });
    return;
  }

  const { action } = data;
  switch (action) {
    case "open":
      await handle_open({ data, reply });
      break;

    case "status":
      // TODO reply with an "elaborate" status message, e.g. list each project ID, did it load (true/false), ...
      reply({
        status: "done",
        connection: connection_status(),
        open_files: all_opened_files() || {},
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

// this must be run to set this up
// currently, this only happens for minimal/kiosk mode in smc-webapp/entry-point.coffee
export function init() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("message", process_message, false);
}
