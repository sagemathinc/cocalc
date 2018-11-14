/*
Plug: Class to ensure that the SyncTable stays "plugged" into the hub, if at all possible.

NOTE: I implemented this outside of SyncTable so that it would be much easier
      to reason about, and be sure the code is right.
*/

export class Plug {
  constructor(opts) {
    this.close = this.close.bind(this);
    this.dbg = this.dbg.bind(this);
    this.connect = this.connect.bind(this);
    this.__try_to_connect_once = this.__try_to_connect_once.bind(this);
    this._opts = defaults(opts, {
      name: "plug", // Used only for debug logging
      no_sign_in: required, // True if sign is isn't required before connecting, e.g., anonymous synctable and project.
      client: required, // The client object, which provides:
      //   'connected' and 'signed_in' events, and
      //   is_connected() and is_signed_in() functions.
      connect: required, // A function to call to create a connection; it should run as
      // quickly as it can and call it's callback with an error if
      // and only if it fails.  It will definitely only be called
      // once at a time, so no need to put in any sort of block.
      extra_dbg: ""
    }); // used only for debugging
    this._state = "run";
    this.connect();
  }

  close() {
    return (this._state = "closed");
  }

  dbg(f) {
    if (this._opts.client.is_project()) {
      return this._opts.client.dbg(
        `Plug('${this._opts.name}', '${this._opts.extra_dbg}').${f}`
      );
    } else {
      return () => {};
    }
  }

  // Keep trying until we connect - always succeeds if it terminates
  // TODO: make async.
  connect(): void {
    const dbg = this.dbg("connect");
    if (this._state === "closed") {
      dbg("closed");
      return;
    }
    if (this._is_connecting) {
      dbg("already connecting");
      return;
    }
    this._is_connecting = true;
    dbg("");
    misc.retry_until_success({
      f: this.__try_to_connect_once,
      log: dbg,
      start_delay: 3000,
      max_delay: 12000,
      cb: () => {
        delete this._is_connecting;
        dbg("success!");
      }
    });
  }

  // Try to connect exactly once.  cb gets error if and only if fails to connect.
  __try_to_connect_once(cb) {
    let event;
    if (this._state === "closed") {
      cb();
      return;
    }

    // timer for giving up on waiting to try to connect
    let give_up_timer = undefined;

    // actually try to connect
    var do_connect = () => {
      if (this._state === "closed") {
        cb(); // not error since we want the retry_until_success to terminate
        return;
      }
      if (!this._opts.no_sign_in) {
        if (!this._opts.client.is_signed_in()) {
          cb("not signed in but need to be");
          return;
        }
      }
      if (give_up_timer != null) {
        this._opts.client.removeListener(event, do_connect);
        clearTimeout(give_up_timer);
      }
      return this._opts.connect(err => {
        if (this._state === "closed") {
          cb();
          return;
        }
        if (err === "closed") {
          return cb(); // success = stop trying.
        } else {
          return cb(err);
        }
      });
    };

    // Which event/condition has too be true before we even try to connect.
    if (this._opts.no_sign_in) {
      event = "connected";
    } else {
      event = "signed_in";
    }

    if (this._opts.client[`is_${event}`]()) {
      // The condition is satisfied, so try once to connect.
      return do_connect();
    } else {
      // Wait until condition is satisfied...
      this._opts.client.once(event, do_connect);
      // ... but don't wait forever, in case for some reason we miss
      // the event (this can maybe rarely happen).
      const give_up = () => {
        this._opts.client.removeListener(event, do_connect);
        return cb("timeout");
      };
      return (give_up_timer = setTimeout(
        give_up,
        30000 + Math.random() * 10000
      ));
    }
  }
}
