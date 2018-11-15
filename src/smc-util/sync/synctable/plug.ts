/*
Plug: Class to ensure that the SyncTable stays "plugged" into the hub, if at all possible.

NOTE: I implemented this outside of SyncTable so that it would be much easier
      to reason about, and be sure the code is right.
*/

import { retry_until_success } from "../../async-utils";

import { callback } from "awaiting";

interface Options {
  // Used only for debug logging
  name?: string;

  // True if sign is isn't required before connecting, e.g., anonymous synctable and project.
  no_sign_in: boolean;

  // The client object, which provides:
  //   'connected' and 'signed_in' events, and
  //   is_connected() and is_signed_in() functions.
  client: {
    is_connected: Function;
    is_signed_in: Function;
    on: Function;
    once: Function;
    removeListener: Function;
    is_project: Function;
    dbg: Function;
  };

  // A function to call to create a connection; it should run as
  // quickly as it can and call it's callback with an error if
  // and only if it fails.  It will definitely only be called
  // once at a time, so no need to put in any sort of block.
  connect: Function;

  // used only for debugging
  extra_dbg: any;
}

export class Plug {
  private opts: Options;
  private state: string = "run";
  private is_connecting: boolean = false;

  constructor(opts: Options) {
    this.opts = opts;
    if (!this.opts.name) {
      this.opts.name = "plug";
    }
    this.close = this.close.bind(this);
    this.dbg = this.dbg.bind(this);
    this.connect = this.connect.bind(this);
    this.try_to_connect_once = this.try_to_connect_once.bind(this);
    this.connect();
  }

  close(): void {
    this.state = "closed";
  }

  private dbg(f: string): Function {
    if (this.opts.client.is_project()) {
      return this.opts.client.dbg(
        `Plug('${this.opts.name}', '${this.opts.extra_dbg}').${f}`
      );
    } else {
      return () => {};
    }
  }

  // Keep trying until we connect - always succeeds if
  // it terminates.
  async connect(): Promise<void> {
    const dbg = this.dbg("connect");
    if (this.state === "closed") {
      dbg("closed");
      return;
    }
    if (this.is_connecting) {
      dbg("already connecting");
      return;
    }
    this.is_connecting = true;
    dbg("");
    await retry_until_success({
      f: this.try_to_connect_once,
      log: dbg,
      start_delay: 3000,
      max_delay: 12000
    });
    this.is_connecting = false;
    dbg("success!");
  }

  // Try to connect exactly once.
  // TODO: try to massively simplify this by switching
  // to a single project websocket...
  // TODO: I got rid of the give_up timeout below.
  private async try_to_connect_once(): Promise<void> {
    if (this.state === "closed") {
      return;
    }

    // actually try to connect
    async function do_connect(): Promise<void> {
      if (this.state === "closed") {
        // not error since we want the retry_until_success to terminate
        return;
      }
      if (!this.opts.no_sign_in) {
        if (!this.opts.client.is_signed_in()) {
          throw Error("not signed in but need to be");
          return;
        }
      }
      try {
        await callback(this.opts.connect);
      } catch (err) {
        if (this.state === "closed") {
          return;
        }
        throw err;
      }
    }

    // Which event/condition has too be true before we even try to connect.
    let event;
    if (this.opts.no_sign_in) {
      event = "connected";
    } else {
      event = "signed_in";
    }

    function f(cb) {
      this.opts.client.once(event, () => cb());
    }

    if (this.opts.client[`is_${event}`]()) {
      // The condition is satisfied, so try once to connect.
      await do_connect();
    } else {
      // Wait until condition is satisfied...
      await callback(f);
      await do_connect();
    }
  }
}
