/*
Make a SyncTable which does not use a changefeed or the central
database at all.

The initial read waits on the client calling a function to provide
the initial data, and all changes are also injected by explicitly
calling a function.  An event is emitted when a new change is made
that has to get saved.

This is used to implement the browser side of project specific
SyncTables.  It's also obviously useful for unit testing.
*/

import { EventEmitter } from "events";

import { SyncTable, Client } from "./synctable";

import { bind_methods } from "../../async-utils";

import { keys } from "../../misc2";

export function synctable_no_database(
  query,
  options,
  client: Client,
  throttle_changes?: undefined | number
): SyncTable {
  if (options == null) {
    options = [];
  }
  const client2 = new ClientNoDatabase(client);
  return new SyncTable(query, options, client2, throttle_changes);
}

class ClientNoDatabase extends EventEmitter {
  private client: Client;

  constructor(client) {
    super();

    bind_methods(this, ["query", "dbg", "query_cancel"]);
    this.client = client;
  }

  public is_project(): boolean {
    return this.client.is_project();
  }

  public is_connected(): boolean {
    return true;
  }

  public is_signed_in(): boolean {
    return true;
  }

  public dbg(s: string): Function {
    return this.client.dbg(s);
  }

  public query(opts): void {
    if (opts.options && opts.options.length === 1 && opts.options[0].set) {
      // set query
      opts.cb();
    } else {
      // get query -- returns empty result.
      const table = keys(opts.query)[0];
      opts.cb(undefined, { query: { [table]: [] } });
    }
  }

  public query_cancel(_): void {}

  public alert_message(opts): void {
    if (this.client.alert_message != null) {
      this.client.alert_message(opts);
    }
  }
}
