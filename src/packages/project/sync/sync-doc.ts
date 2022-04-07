/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Backend project support for using syncdocs.

This is mainly responsible for:

- loading and saving files to disk
- executing code

*/

import { SyncTable } from "@cocalc/sync/table";
import { SyncDB } from "@cocalc/sync/editor/db/sync";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { Client } from "@cocalc/sync/editor/generic/types";
import { once } from "@cocalc/util/async-utils";
import { filename_extension } from "@cocalc/util/misc";
import { jupyter_backend } from "../jupyter/jupyter";
import { EventEmitter } from "events";

const COCALC_EPHEMERAL_STATE: boolean =
  process.env.COCALC_EPHEMERAL_STATE === "yes";

class SyncDocs extends EventEmitter {
  private syncdocs: { [path: string]: SyncDoc } = {};
  private closing: Set<string> = new Set();

  async close(path: string, log?): Promise<void> {
    const doc = this.get(path);
    if (doc == null) {
      log?.(`close ${path} -- no need, as it is not opened`);
      return;
    }
    try {
      log?.(`close ${path} -- starting close`);
      this.closing.add(path);
      // As soon as this close starts, doc is in an undefined state.
      // Also, this can take an **unbounded** amount of time to finish,
      // since it tries to save the patches table (among other things)
      // to the database, and if there is no connection from the hub
      // to this project, then it will simply wait however long it takes
      // until we get a connection (and there is no timeout).  That is
      // perfectly fine!  E.g., a user closes their browser connected
      // to a project, then comes back 8 hours later and tries to open
      // this document when they resume their browser.  During those entire
      // 8 hours, the project might have been waiting to reconnect, just
      // so it could send the patches from patches_list to the database.
      // It does that, then finishes this async doc.close(), releases
      // the lock, and finally the user gets to open their file. See
      // https://github.com/sagemathinc/cocalc/issues/5823 for how not being
      // careful with locking like this resulted in a very difficult to
      // track down heisenbug. See also
      // https://github.com/sagemathinc/cocalc/issues/5617
      await doc.close();
      log?.(`close ${path} -- successfully closed`);
    } finally {
      // No matter what happens above when it finishes, we clear it
      // and consider it closed.
      // There is perhaps a chance closing fails above (no idea how),
      // but we don't want it to be impossible to attempt to open
      // the path again I.e., we don't want to leave around a lock.
      log?.(`close ${path} -- recording that close succeeded`);
      delete this.syncdocs[path];
      this.closing.delete(path);
      this.emit(`close-${path}`);
    }
  }

  get(path: string): SyncDoc | undefined {
    return this.syncdocs[path];
  }

  async create(type, opts, log): Promise<SyncDoc> {
    const path = opts.path;
    if (this.closing.has(path)) {
      log(
        `create ${path} -- waiting for previous version to completely finish closing...`
      );
      await once(this, `close-${path}`);
      log(`create ${path} -- successfully closed.`);
    }
    let doc;
    switch (type) {
      case "string":
        doc = new SyncString(opts);
        break;
      case "db":
        doc = new SyncDB(opts);
        break;
      default:
        throw Error(`unknown syncdoc type ${type}`);
    }
    this.syncdocs[path] = doc;
    log(`create ${path} -- successfully created.`);
    return doc;
  }

  async closeAll(filename: string): Promise<void> {
    for (const path in this.syncdocs) {
      if (path == filename || path.startsWith(filename + "/")) {
        await this.close(path);
      }
    }
  }
}

const syncDocs = new SyncDocs();

export function init_syncdoc(
  client: Client,
  synctable: SyncTable,
  logger: any
): void {
  if (synctable.get_table() !== "syncstrings") {
    throw Error("table must be 'syncstrings'");
  }
  if (synctable.get_state() == "closed") {
    throw Error("synctable must not be closed");
  }
  // It's the right type of table and not closed.  Now do
  // the real setup work (without blocking).
  init_syncdoc_async(client, synctable, logger);
}

// If there is an already existing syncdoc for this path,
// return it; otherwise, return undefined.  This is useful
// for getting a reference to a syncdoc, e.g., for prettier.
export function get_syncdoc(path: string): SyncDoc | undefined {
  return syncDocs.get(path);
}

async function init_syncdoc_async(
  client: Client,
  synctable: SyncTable,
  logger: any
): Promise<void> {
  function log(...args): void {
    logger.debug("init_syncdoc -- ", ...args);
  }

  log("waiting until synctable is ready");
  await wait_until_synctable_ready(synctable, log);
  log("synctable ready.  Now getting type and opts");
  const { type, opts } = get_type_and_opts(synctable);
  opts.project_id = client.client_id();
  log("type = ", type);
  log("opts = ", JSON.stringify(opts));
  opts.client = client;
  log(`now creating syncdoc ${opts.path}...`);
  let syncdoc;
  try {
    syncdoc = await syncDocs.create(type, opts, log);
  } catch (err) {
    log(`ERROR creating syncdoc -- ${err.toString()}`, err.stack);
    // TODO: how to properly inform clients and deal with this?!
    return;
  }
  synctable.on("closed", function () {
    log("syncstring table closed, so closing syncdoc", opts.path);
    syncDocs.close(opts.path, log);
  });

  syncdoc.on("error", function (err) {
    log(`syncdoc error -- ${err}`);
    syncDocs.close(opts.path, log);
  });

  // Extra backend support in some cases, e.g., Jupyter, Sage, etc.
  const ext = filename_extension(opts.path);
  log("ext = ", ext);
  switch (ext) {
    case "sage-jupyter2":
      log("activating jupyter backend");
      jupyter_backend(syncdoc, client);
      break;
  }
}

async function wait_until_synctable_ready(
  synctable: SyncTable,
  log: Function
): Promise<void> {
  if (synctable.get_state() == "disconnected") {
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
  const opts = { path, ephemeral: COCALC_EPHEMERAL_STATE };
  let type: string = "";

  let doctype = s.get("doctype");
  if (doctype != null) {
    try {
      doctype = JSON.parse(doctype);
    } catch {
      doctype = {};
    }
    if (doctype.opts != null) {
      for (const k in doctype.opts) {
        opts[k] = doctype.opts[k];
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

export async function syncdoc_call(
  path: string,
  logger: any,
  mesg: any
): Promise<string> {
  logger.debug("syncdoc_call", path, mesg);
  const doc = syncDocs.get(path);
  if (doc == null) {
    logger.debug("syncdoc_call -- not open: ", path);
    return "not open";
  }
  switch (mesg.cmd) {
    case "close":
      logger.debug("syncdoc_call -- now closing: ", path);
      await syncDocs.close(path, logger.debug);
      logger.debug("syncdoc_call -- closed: ", path);
      return "successfully closed";
    default:
      throw Error(`unknown command ${mesg.cmd}`);
  }
}

// This is used when deleting a file/directory
// filename may be a directory or actual filename
export async function close_all_syncdocs_in_tree(
  filename: string
): Promise<void> {
  return await syncDocs.closeAll(filename);
}
