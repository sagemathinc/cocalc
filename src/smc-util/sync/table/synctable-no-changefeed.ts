/*
Make a SyncTable which does not use a changefeed at all.

It does the initial database read as usual, and also
writes changes as usual, but does not use a changefeed
at all.   Instead changes are injected by calling
a function.

This is used by a backend project for implementing a version
of SyncTable, where the project itself handles all changes,
not the database or hubs.   However, data is still persisted
to the central database.

Returned object is not cached in any way.
*/

import { EventEmitter } from "events";

import { SyncTable, Client } from "./synctable";

import { bind_methods } from "../../async-utils";

interface Change {
  new_val?: any;
  old_val?: any;
}

export interface SyncTableNoChangefeed extends SyncTable {
  update(change: Change): void;
}

export function synctable_no_changefeed(
  query,
  options,
  client: Client,
  throttle_changes?: undefined | number
): SyncTableNoChangefeed {
  if (options == null) {
    options = [];
  }
  const client2 = new ClientNoChangefeed(client);
  const synctable = new SyncTable(query, options, client2, throttle_changes);
  const synctable2: SyncTableNoChangefeed = synctable as SyncTableNoChangefeed;
  synctable2.update = client2.update.bind(client2);
  return synctable2;
}

class ClientNoChangefeed extends EventEmitter {
  private client: Client;
  private changes_cb: Function;

  constructor(client) {
    super();

    bind_methods(this, [
      "query",
      "update",
      "dbg",
      "query_cancel",
      "emit_connected",
      "emit_signed_in"
    ]);
    this.client = client;

    // These MUST be after the binds above, obviously.
    client.on("connected", this.emit_connected);
    client.on("signed_in", this.emit_signed_in);
  }

  private emit_connected(): void {
    this.emit("connected");
  }

  private emit_signed_in(): void {
    this.emit("signed_in");
  }

  public is_project(): boolean {
    return this.client.is_project();
  }

  public is_connected(): boolean {
    return this.client.is_connected();
  }

  public is_signed_in(): boolean {
    return this.client.is_signed_in();
  }

  public dbg(s: string): Function {
    return this.client.dbg(s);
  }

  public query(opts): void {
    if (opts.changes) {
      this.changefeed_query(opts);
    } else {
      this.client.query(opts);
    }
  }

  private changefeed_query(opts): void {
    opts.changes = false;
    this.changes_cb = opts.cb;
    this.client.query(opts);
  }

  public update(change: Change): void {
    // TODO: will write to the changefeed.
    console.log("got change", change);
    if (this.changes_cb != null) {
      this.changes_cb(undefined, change);
    }
  }

  public query_cancel(_): void {
    // no op since no changefeed.
    delete this.changes_cb;
    this.client.removeListener("connected", this.emit_connected);
    this.client.removeListener("signed_in", this.emit_signed_in);
  }

  public alert_message(opts): void {
    if (this.client.alert_message != null) {
      this.client.alert_message(opts);
    }
  }
}
