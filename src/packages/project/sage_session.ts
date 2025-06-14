//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: MS-RSL – see LICENSE.md for details
//########################################################################

/*
Start the Sage server and also get a new socket connection to it.
*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { getLogger } from "@cocalc/backend/logger";
import processKill from "@cocalc/backend/misc/process-kill";
import { abspath } from "@cocalc/backend/misc_node";
import type {
  Type as TCPMesgType,
  Message as TCPMessage,
} from "@cocalc/backend/tcp/enable-messaging-protocol";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import * as message from "@cocalc/util/message";
import {
  path_split,
  to_json,
  trunc,
  trunc_middle,
  uuid,
} from "@cocalc/util/misc";
import { CB } from "@cocalc/util/types/callback";
import { ISageSession, SageCallOpts } from "@cocalc/util/types/sage";
import { Client } from "./client";
import { getSageSocket } from "./sage_socket";

// import { ExecuteCodeOutput } from "@cocalc/util/types/execute-code";

const winston = getLogger("sage-session");

//##############################################
// Direct Sage socket session -- used internally in local hub, e.g., to assist CodeMirror editors...
//##############################################

// we have to make sure to only export the type to avoid error TS4094
export type SageSessionType = InstanceType<typeof SageSession>;

interface SageSessionOpts {
  client: Client;
  path: string; // the path to the *worksheet* file
}

const cache: { [path: string]: SageSessionType } = {};

export function sage_session(opts: Readonly<SageSessionOpts>): SageSessionType {
  const { path } = opts;
  // compute and cache if not cached; otherwise, get from cache:
  return (cache[path] = cache[path] ?? new SageSession(opts));
}
// TODO for project-info/server we need a function that returns a path to a sage worksheet for a given PID
//export function get_sage_path(pid) {}
//    return path
// }

/*
Sage Session object

Until you actually try to call it no socket need
*/
class SageSession implements ISageSession {
  private _path: string;
  private _client: Client;
  private _output_cb: {
    [key: string]: CB<{ done: boolean; error: string }, any>;
  } = {};
  private _socket: CoCalcSocket | undefined;
  public init_socket: () => Promise<void>;

  constructor(opts: Readonly<SageSessionOpts>) {
    this.dbg = this.dbg.bind(this);
    this.close = this.close.bind(this);
    this.is_running = this.is_running.bind(this);
    this._init_socket = this._init_socket.bind(this);
    this.init_socket = reuseInFlight(this._init_socket).bind(this);
    this._init_path = this._init_path.bind(this);
    this.call = this.call.bind(this);
    this._handle_mesg_blob = this._handle_mesg_blob.bind(this);
    this._handle_mesg_json = this._handle_mesg_json.bind(this);
    this.dbg("constructor")();
    this._path = opts.path;
    this._client = opts.client;
    this._output_cb = {};
  }

  private dbg(f: string) {
    return (m?: string) =>
      winston.debug(`SageSession(path='${this._path}').${f}: ${m}`);
  }

  public close(): void {
    if (this._socket != null) {
      const pid = this._socket.pid;
      if (pid != null) processKill(pid, 9);
    }
    this._socket?.end();
    delete this._socket;
    for (let id in this._output_cb) {
      const cb = this._output_cb[id];
      cb({ done: true, error: "killed" });
    }
    this._output_cb = {};
    delete cache[this._path];
  }

  // return true if there is a socket connection to a sage server process
  is_running(): boolean {
    return this._socket != null;
  }

  // NOTE: There can be many simultaneous init_socket calls at the same time,
  // if e.g., the socket doesn't exist and there are a bunch of calls to @call
  // at the same time.
  // See https://github.com/sagemathinc/cocalc/issues/3506
  // wrapped in reuseInFlight !
  private async _init_socket(): Promise<void> {
    const dbg = this.dbg("init_socket()");
    dbg();
    try {
      const socket: CoCalcSocket = await getSageSocket();

      dbg("successfully opened a sage session");
      this._socket = socket;

      socket.on("end", () => {
        delete this._socket;
        return dbg("codemirror session terminated");
      });

      // CRITICAL: we must define this handler before @_init_path below,
      // or @_init_path can't possibly work... since it would wait for
      // this handler to get the response message!
      socket.on("mesg", (type: TCPMesgType, mesg: TCPMessage) => {
        dbg(`sage session: received message ${type}`);
        switch (type) {
          case "json":
            this._handle_mesg_json(mesg);
            break;
          case "blob":
            this._handle_mesg_blob(mesg);
            break;
        }
      });

      await this._init_path();
    } catch (err) {
      if (err) {
        dbg(`fail -- ${err}.`);
        throw err;
      }
    }
  }

  private async _init_path(): Promise<void> {
    const dbg = this.dbg("_init_path()");
    dbg();
    return new Promise<void>((resolve, reject) => {
      this.call({
        input: {
          event: "execute_code",
          code: "os.chdir(salvus.data['path']);__file__=salvus.data['file']",
          data: {
            path: abspath(path_split(this._path).head),
            file: abspath(this._path),
          },
          preparse: false,
        },
        cb: (resp) => {
          let err: string | undefined = undefined;
          if (resp.stderr) {
            err = resp.stderr;
            dbg(`error '${err}'`);
          }
          if (resp.done) {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        },
      });
    });
  }

  public async call({ input, cb }: Readonly<SageCallOpts>): Promise<void> {
    const dbg = this.dbg("call");
    dbg(`input='${trunc(to_json(input), 300)}'`);
    switch (input.event) {
      case "ping":
        cb({ pong: true });
        return;

      case "status":
        cb({ running: this.is_running() });
        return;

      case "signal":
        if (this._socket != null) {
          dbg(`sending signal ${input.signal} to process ${this._socket.pid}`);
          const pid = this._socket.pid;
          if (pid != null) processKill(pid, input.signal);
        }
        cb({});
        return;

      case "restart":
        dbg("restarting sage session");
        if (this._socket != null) {
          this.close();
        }
        try {
          await this.init_socket();
          cb({});
        } catch (err) {
          cb({ error: err });
        }
        return;

      case "raw_input":
        dbg("sending sage_raw_input event");
        this._socket?.write_mesg("json", {
          event: "sage_raw_input",
          value: input.value,
        });
        return;

      default:
        // send message over socket and get responses
        try {
          if (this._socket == null) {
            await this.init_socket();
          }

          if (input.id == null) {
            input.id = uuid();
            dbg(`generated new random uuid for input: '${input.id}' `);
          }

          if (this._socket == null) {
            throw new Error("no socket");
          }

          this._socket.write_mesg("json", input);

          this._output_cb[input.id] = cb; // this is when opts.cb will get called...
        } catch (err) {
          cb({ done: true, error: err });
        }
    }
  }
  private _handle_mesg_blob(mesg: TCPMessage) {
    const { uuid } = mesg;
    let { blob } = mesg;
    const dbg = this.dbg(`_handle_mesg_blob(uuid='${uuid}')`);
    dbg();

    if (blob == null) {
      dbg("no blob -- dropping message");
      return;
    }

    // This should never happen, typing enforces this to be a Buffer
    if (typeof blob === "string") {
      dbg("blob is string -- converting to buffer");
      blob = Buffer.from(blob, "utf8");
    }

    this._client.save_blob({
      blob,
      uuid,
      cb: (err, resp) => {
        if (err) {
          resp = message.save_blob({
            error: err,
            sha1: uuid, // dumb - that sha1 should be called uuid...
          });
        }
        this._socket?.write_mesg("json", resp);
      },
    });
  }

  private _handle_mesg_json(mesg: TCPMessage) {
    const dbg = this.dbg("_handle_mesg_json");
    dbg(`mesg='${trunc_middle(to_json(mesg), 400)}'`);
    if (mesg == null) return; // should not happen
    const { id } = mesg;
    if (id == null) return; // should not happen
    const cb = this._output_cb[id];
    if (cb != null) {
      // Must do this check first since it uses done:false.
      if (mesg.done || mesg.done == null) {
        delete this._output_cb[id];
        mesg.done = true;
      }
      if (mesg.done != null && !mesg.done) {
        // waste of space to include done part of mesg if just false for everything else...
        delete mesg.done;
      }
      cb(mesg);
    }
  }
}
