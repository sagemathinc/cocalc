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
  throttle_changes: undefined | number = undefined,
  initial_get_query: any[] = []
): SyncTable {
  if (options == null) {
    options = [];
  }
  const client2 = new ClientNoDatabase(client, initial_get_query);
  return new SyncTable(query, options, client2, throttle_changes, true);
}

class ClientNoDatabase extends EventEmitter {
  private client: Client;
  private initial_get_query: any[];
  private connected : boolean = true;

  constructor(client, initial_get_query) {
    super();

    this.initial_get_query = initial_get_query;
    bind_methods(this, ["query", "dbg", "query_cancel"]);
    this.client = client;
  }

  public set_connected(connected: boolean): void {
    const event = connected && this.connected != connected;
    this.connected = connected;
    if (event) {
      this.emit("signed_in");
      this.emit("connected");
    }
  }

  public is_project(): boolean {
    return this.client.is_project();
  }

  public is_connected(): boolean {
    return this.connected;
  }

  public is_signed_in(): boolean {
    return this.connected;
  }

  public dbg(s: string): Function {
    return this.client.dbg(s);
  }

  public query(opts): void {
    if (opts.options && opts.options.length === 1 && opts.options[0].set) {
      if (this.connected) {
        // set query -- totally ignore.
        opts.cb();
      } else {
        opts.cb("disconnected");
      }
    } else {
      // get query -- returns predetermined result (default: empty)
      const table = keys(opts.query)[0];
      opts.cb(undefined, { query: { [table]: this.initial_get_query } });
    }
  }

  public query_cancel(_): void {}

  public alert_message(opts): void {
    if (this.client.alert_message != null) {
      this.client.alert_message(opts);
    }
  }
}
