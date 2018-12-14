/*
Backend project support for using syncdocs.

This is mainly responsible for:

- loading and saving files to disk
- executing code

*/

import { SyncTable } from "../smc-util/sync/table";
import { SyncDB } from "../smc-util/sync/editor/db/sync";
import { SyncString } from "../smc-util/sync/editor/string/sync";
import { SyncDoc } from "../smc-util/sync/editor/generic/sync-doc";
import { Client } from "../smc-util/sync/editor/generic/types";
import { once } from "../smc-util/async-utils";

export function init_syncdoc(
  client: Client,
  synctable: SyncTable,
  logger: any
): void {
  if (synctable.table !== "syncstrings") {
    throw Error("table must be 'syncstrings'");
  }
  if (synctable.state === "closed") {
    throw Error("synctable must not be closed");
  }
  // It's the right type of table and not closed.  Now do the real setup work (without blocking).
  init_syncdoc_async(client, synctable, logger);
}

async function init_syncdoc_async(
  client: Client,
  synctable: SyncTable,
  logger: any
): Promise<void> {
  function log(...args): void {
    logger.debug("init_syncdoc -- ", ...args);
  }

  log("waiting until syncstable is ready");
  await wait_until_synctable_ready(synctable, log);
  log("synctable ready.  Now getting type and opts");
  const { type, opts } = get_type_and_opts(synctable);
  opts.project_id = client.client_id();
  log("type = ", type);
  log("opts = ", opts);
  opts.client = client;
  log("now creating syncdoc");
  const syncdoc = create_syncdoc(type, opts);
  synctable.on("closed", function() {
    log("syncstring table closed, so closing syncdoc", opts.path);
    syncdoc.close();
  });
}

async function wait_until_synctable_ready(
  synctable: SyncTable,
  log: Function
): Promise<void> {
  if (synctable.state === "disconnected") {
    log("wait for synctable be connected");
    await once(synctable, "connected");
  }

  const t = synctable.get_one();
  if (t != null) {
    log("currently", t.toJS());
  }
  log("wait for document info to get loaded into synctable...");
  // Next wait until there's a document in the synctable, since that will
  // have the path, patch type, etc. in it.  That is set by the frontend.
  function is_ready(): boolean {
    const t = synctable.get_one();
    if (t == null) {
      log("is_ready: table is null still");
      return false;
    } else {
      log("is_ready", JSON.stringify(t));
      return t.has("path");
    }
  }
  await synctable.wait(is_ready, 0);
  log("document info is now in synctable");
}

function get_type_and_opts(synctable: SyncTable): { type: string; opts: any } {
  const s = synctable.get_one();
  if (s == null) {
    throw Error("synctable must not be empty");
  }
  const path = s.get("path");
  if (typeof path != "string") {
    throw Error("path must be a string");
  }
  let opts = { path };
  let type: string = "";

  let doctype = s.get("doctype");
  if (doctype != null) {
    try {
      doctype = JSON.parse(doctype);
    } catch {
      doctype = {};
    }
    if (doctype.opts != null) {
      for (let k in doctype.opts) {
        opts[k] = doctype[k];
      }
    }
    type = doctype.type;
  }
  if (type !== "db" && type !== "string") {
    // fallback type
    type = "string";
  }
  return { type, opts };
}

function create_syncdoc(type, opts): SyncDoc {
  switch (type) {
    case "string":
      return new SyncString(opts);
    case "db":
      return new SyncDB(opts);
    default:
      throw Error(`unknown syncdoc type ${type}`);
  }
}
