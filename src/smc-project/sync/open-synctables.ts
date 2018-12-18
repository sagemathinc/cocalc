/*
All SyncTables that are currently open and being managed in this project.

*/

import { callback } from "awaiting";

import { SyncTable } from "../smc-util/sync/table";

const open_synctables: { [key: string]: SyncTable } = {};
const wait_for: { [key: string]: Function[] } = {};

function key(query): string {
  let table: string = Object.keys(query)[0];
  if (!table) {
    throw Error("no table in query");
  }
  const c = query[table];
  if (c == null) {
    throw Error("invalid query format");
  }
  const string_id = c.string_id;
  if (string_id == null) {
    throw Error(
      "open-syncstring-tables is only for tables related to syncstrings (patches, cursors, etc.)"
    );
  }
  return `${table}.${c.string_id}`;
}

export function register_synctable(query: any, synctable: SyncTable): void {
  const k = key(query);
  open_synctables[k] = synctable;
  synctable.on("closed", function() {
    delete open_synctables[k];
  });
  if (wait_for[k] != null) {
    handle_wait_for(k, synctable);
  }
}

export async function get_synctable(query, client): Promise<SyncTable> {
  const k = key(query);
  const log = client.dbg(`get_synctable(key=${k})`);
  log("open_synctables = ", Object.keys(open_synctables));
  log("query=", query);
  const s = open_synctables[k];
  if (s != null) {
    // easy - already have it.
    log("done");
    return s;
  }
  function f(cb: Function) {
    log("f got called");
    add_to_wait_for(k, cb);
  }
  log("waiting...");
  const synctable = await callback(f);
  log(`got the synctable! ${JSON.stringify((synctable as any).query)}`);
  return synctable;
}

function add_to_wait_for(k: string, cb: Function): void {
  if (wait_for[k] == null) {
    wait_for[k] = [cb];
  } else {
    wait_for[k].push(cb);
  }
}

function handle_wait_for(k: string, synctable: SyncTable): void {
  if (wait_for[k] == null) {
    return;
  }
  const v: Function[] = wait_for[k];
  delete wait_for[k];
  for (let cb of v) {
    cb(undefined, synctable);
  }
}
