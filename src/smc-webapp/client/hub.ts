/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { callback, delay } from "awaiting";
import { throttle } from "lodash";
import { WebappClient } from "./client";
import { delete_cookie } from "../misc-page/cookies";
import { QueryParams } from "../misc/query-params";
import {
  copy_without,
  from_json_socket,
  to_json_socket,
  defaults,
  required,
  uuid,
} from "smc-util/misc";
import * as message from "smc-util/message";
import {
  do_anonymous_setup,
  should_do_anonymous_setup,
} from "./anonymous-setup";
import { deleteRememberMe, setRememberMe } from "smc-util/remember-me";

// Maximum number of outstanding concurrent messages (that have responses)
// to send at once to hub-websocket.
const MAX_CONCURRENT: number = 17;

export interface MessageInfo {
  count: number;
  sent: number;
  sent_length: number;
  recv: number;
  recv_length: number;
  enqueued: number;
  max_concurrent: number;
}

export class HubClient {
  private client: WebappClient;
  private conn: any; // primus connection

  private connected: boolean = false;
  private connection_is_totally_dead: boolean = false;
  private num_attempts: number = 0;
  private signed_in: boolean = false;
  private signed_in_time: number = 0;
  private signed_in_mesg: object;

  private call_callbacks: {
    [id: string]: {
      timeout?: any;
      error_event: boolean;
      first: boolean;
      cb: Function;
    };
  } = {};

  private mesg_data: {
    queue: any[];
    count: number;
    sent: number;
    sent_length: number;
    recv: number;
    recv_length: number;
  } = {
    queue: [], // messages in the queue to send
    count: 0, // number of message currently outstanding
    sent: 0, // total number of messages sent to backend.
    sent_length: 0, // total amount of data sent
    recv: 0, // number of messages received from backend
    recv_length: 0,
  };

  constructor(client: WebappClient) {
    this.client = client;

    /* We heavily throttle this, since it's ONLY used for the connections
    dialog, which users never look at, and it could waste cpu trying to
    update things for no reason.  It also impacts the color of the
    connection indicator, so throttling will make that color change a
    bit more laggy.  That's probably worth it. */
    this.emit_mesg_data = throttle(this.emit_mesg_data.bind(this), 2000);

    // never attempt to reconnect more than once per 10s, no matter what.
    this.reconnect = throttle(this.reconnect.bind(this), 10000);

    // Start attempting to connect to a hub.
    this.init_hub_websocket();
  }

  private emit_mesg_data(): void {
    const info: MessageInfo = copy_without(this.mesg_data, ["queue"]) as any;
    info.enqueued = this.mesg_data.queue.length;
    info.max_concurrent = MAX_CONCURRENT;
    this.client.emit("mesg_info", info);
  }

  public get_num_attempts(): number {
    return this.num_attempts;
  }

  public send(mesg: object): void {
    //console.log("send at #{misc.mswalltime()}", mesg)
    const data = to_json_socket(mesg);
    this.mesg_data.sent_length += data.length;
    this.emit_mesg_data();
    this.write_data(data);
  }

  private write_data(data) {
    try {
      return this.conn.write(data);
    } catch (err) {
      console.warn("HubClient.write_data", err);
    }
  }

  private delete_websocket_cookie(): void {
    delete_cookie("SMCSERVERID3");
  }

  public is_signed_in(): boolean {
    return this.is_connected() && !!this.signed_in;
  }

  public set_signed_in(): void {
    this.signed_in = true;
  }

  public set_signed_out(): void {
    this.signed_in = false;
  }

  public get_signed_in_time(): number {
    return this.signed_in_time;
  }

  public get_signed_in_mesg(): object {
    return this.signed_in_mesg;
  }

  public is_connected(): boolean {
    return !!this.connected;
  }

  public reconnect(): void {
    if (this.connection_is_totally_dead) {
      // CRITICAL: See https://github.com/primus/primus#primusopen !
      if (this.conn != null) {
        this.conn.open();
      }
    }
  }

  public disconnect(): void {
    if (this.connected && this.conn != null) {
      this.conn.end();
    }
  }

  private ondata(data: string): void {
    //console.log("got #{data.length} of data")
    this.mesg_data.recv += 1;
    this.mesg_data.recv_length += data.length;
    this.emit_mesg_data();
    this.handle_json_data(data);
  }

  private async handle_json_data(data: string): Promise<void> {
    this.emit_mesg_data();
    const mesg = from_json_socket(data);
    // console.log(`handle_json_data: ${data}`);
    switch (mesg.event) {
      case "cookies":
        try {
          await this.client.account_client.cookies(mesg);
        } catch (err) {
          console.warn("Error handling cookie ", mesg, err);
        }
        break;

      case "signed_in":
        this.client.account_id = mesg.account_id;
        this.set_signed_in();
        this.signed_in_time = new Date().valueOf();
        setRememberMe(window.app_base_path);
        this.signed_in_mesg = mesg;
        this.client.emit("signed_in", mesg);
        break;

      case "remember_me_failed":
        deleteRememberMe(window.app_base_path);
        this.client.emit(mesg.event, mesg);
        break;

      case "version":
        this.client.emit("new_version", {
          version: mesg.version,
          min_version: mesg.min_version,
        });
        break;

      case "error":
        // An error that isn't tagged with an id -- some sort of general problem.
        if (mesg.id == null) {
          console.log(`WARNING: ${JSON.stringify(mesg.error)}`);
          return;
        }
        break;

      case "start_metrics":
        this.client.emit("start_metrics", mesg.interval_s);
        break;
    }

    // the call f(null, mesg) below can mutate mesg (!), so we better save the id here.
    const { id } = mesg;
    const v = this.call_callbacks[id];
    if (v != null) {
      const { cb, error_event } = v;
      v.first = false;
      if (error_event && mesg.event === "error") {
        if (!mesg.error) {
          // make sure mesg.error is set to something.
          mesg.error = "error";
        }
        cb(mesg.error);
      } else {
        cb(undefined, mesg);
      }
      if (!mesg.multi_response) {
        delete this.call_callbacks[id];
      }
    }
  }

  private do_call(opts: any, cb: Function): void {
    if (opts.cb == null) {
      // console.log("no opts.cb", opts.message)
      // A call to the backend, but where we do not wait for a response.
      // In order to maintain at least roughly our limit on MAX_CONCURRENT,
      // we simply pretend that this message takes about 150ms
      // to complete.  This helps space things out so the server can
      // handle requests properly, instead of just discarding them (be nice
      // to the backend and it will be nice to you).
      this.send(opts.message);
      setTimeout(cb, 150);
      return;
    }
    if (opts.message.id == null) {
      // Assign a uuid (usually we do this)
      opts.message.id = uuid();
    }
    const { id } = opts.message;
    let called_cb: boolean = false;
    if (this.call_callbacks[id] != null) {
      // User is requesting to send a message with the same id as
      // a currently  outstanding message.  This typically happens
      // when disconnecting and reconnecting.  It's critical to
      // clear up the existing call before overwritting
      // call_callbacks[id].  The point is the message id's are
      // NOT at all guaranteed to be random.
      this.clear_call(id);
    }

    this.call_callbacks[id] = {
      cb: (...args) => {
        if (!called_cb) {
          called_cb = true;
          cb();
        }
        // NOTE: opts.cb is always defined since otherwise
        // we would have exited above.
        if (opts.cb != null) {
          opts.cb(...args);
        }
      },
      error_event: !!opts.error_event,
      first: true,
    };

    this.send(opts.message);

    if (opts.timeout) {
      this.call_callbacks[id].timeout = setTimeout(() => {
        if (this.call_callbacks[id] == null || this.call_callbacks[id].first) {
          const error = "Timeout after " + opts.timeout + " seconds";
          if (!called_cb) {
            called_cb = true;
            cb();
          }
          if (opts.cb != null) {
            opts.cb(error, message.error({ id, error }));
          }
          delete this.call_callbacks[id];
        }
      }, opts.timeout * 1000);
    } else {
      // IMPORTANT: No matter what, we call cb within 60s; if we don't do this then
      // in case opts.timeout isn't set but opts.cb is, but user disconnects,
      // then cb would never get called, which throws off our call counter.
      // Note that the input to cb doesn't matter.
      const f = () => {
        if (!called_cb) {
          called_cb = true;
          cb();
        }
      };
      this.call_callbacks[id].timeout = setTimeout(f, 60 * 1000);
    }
  }

  public call(opts: any): void {
    // This function:
    //    * Modifies the message by adding an id attribute with a random uuid value
    //    * Sends the message to the hub
    //    * When message comes back with that id, call the callback and delete it (if cb opts.cb is defined)
    //      The message will not be seen by @handle_message.
    //    * If the timeout is reached before any messages come back, delete the callback and stop listening.
    //      However, if the message later arrives it may still be handled by @handle_message.
    opts = defaults(opts, {
      message: required,
      timeout: undefined,
      error_event: false, // if true, turn error events into just a normal err
      allow_post: undefined, // TODO: deprecated
      cb: undefined,
    });
    if (!this.is_connected()) {
      if (opts.cb != null) {
        opts.cb("not connected");
      }
      return;
    }
    this.mesg_data.queue.push(opts);
    this.mesg_data.sent += 1;
    this.update_calls();
  }

  // like call above, but async and error_event defaults to TRUE,
  // so an exception is raised on resp messages that have event='error'.

  public async async_call(opts: any): Promise<any> {
    const f = (cb) => {
      opts.cb = cb;
      this.call(opts);
    };
    if (opts.error_event == null) {
      opts.error_event = true;
    }
    return await callback(f);
  }

  private update_calls(): void {
    while (
      this.mesg_data.queue.length > 0 &&
      this.mesg_data.count < MAX_CONCURRENT
    ) {
      this.process_next_call();
    }
  }

  private process_next_call(): void {
    if (this.mesg_data.queue.length === 0) {
      return;
    }
    this.mesg_data.count += 1;
    const opts = this.mesg_data.queue.shift();
    this.emit_mesg_data();
    this.do_call(opts, () => {
      this.mesg_data.count -= 1;
      this.emit_mesg_data();
      this.update_calls();
    });
  }

  private clear_call(id: string): void {
    const obj = this.call_callbacks[id];
    if (obj == null) return;
    delete this.call_callbacks[id];
    obj.cb("disconnect");
    if (obj.timeout) {
      clearTimeout(obj.timeout);
      delete obj.timeout;
    }
  }

  private clear_call_queue(): void {
    for (const id in this.call_callbacks) {
      this.clear_call(id);
    }
    this.emit_mesg_data();
  }

  private async init_hub_websocket(): Promise<void> {
    const log = (...mesg) => console.log("hub_websocket -", ...mesg);
    log("connect");
    this.client.emit("connecting");

    this.client.on("connected", () => {
      this.send_version();
      // Any outstanding calls made before connecting happened
      // can't possibly succeed, so we clear all outstanding messages.
      this.clear_call_queue();
    });

    this.delete_websocket_cookie();
    // Important: window.Primus is usually defined when we get to the point
    // of running this code.  However, sometimes it doesn't -- timing is random
    // and whether it is defined here depends on a hub being available to
    // serve it up.  So we just keep trying until it is defined.
    let d = 100;
    while (window.Primus == null) {
      console.log("Waiting for global websocket client library...");
      await delay(d);
      d = Math.max(3000, d * 1.3);
    }
    const conn = (this.conn = new (window as any).Primus());

    conn.on("open", () => {
      this.connected = true;
      this.connection_is_totally_dead = false;
      this.client.emit("connected");
      log("connected");
      this.num_attempts = 0;

      conn.removeAllListeners("data");
      conn.on("data", this.ondata.bind(this));

      const auth_token = QueryParams.get("auth_token");
      if (!this.signed_in && auth_token && typeof auth_token == "string") {
        QueryParams.remove("auth_token");
        this.client.account_client.sign_in_using_auth_token(auth_token);
      } else if (should_do_anonymous_setup()) {
        do_anonymous_setup(this.client);
      }
    });

    conn.on("outgoing::open", () => {
      log("connecting");
      this.client.emit("connecting");
    });

    conn.on("offline", () => {
      log("offline");
      this.connected = this.signed_in = false;
      this.client.emit("disconnected", "offline");
    });

    conn.on("online", () => {
      log("online");
    });

    conn.on("message", (evt) => {
      this.ondata(evt.data);
    });

    conn.on("error", (err) => {
      log("error: ", err);
    });
    // NOTE: we do NOT emit an error event in this case!  See
    // https://github.com/sagemathinc/cocalc/issues/1819
    // for extensive discussion.

    conn.on("close", () => {
      log("closed");
      this.connected = this.signed_in = false;
      this.client.emit("disconnected", "close");
    });

    conn.on("end", () => {
      this.connection_is_totally_dead = true;
    });

    conn.on("reconnect scheduled", (opts) => {
      this.num_attempts = opts.attempt;
      // This just informs everybody that we *are* disconnected.
      this.client.emit("disconnected", "close");
      conn.removeAllListeners("data");
      this.delete_websocket_cookie();
      log(
        `reconnect scheduled (attempt ${opts.attempt} out of ${opts.retries})`
      );
    });

    conn.on("reconnect", () => {
      this.client.emit("connecting");
    });
  }

  private send_version(): void {
    this.send(message.version({ version: this.client.version() }));
  }

  public fix_connection(): void {
    this.delete_websocket_cookie();
    this.conn.end();
    this.conn.open();
  }

  public latency(): number | void {
    if (this.connected) {
      return this.conn.latency;
    }
  }
}
