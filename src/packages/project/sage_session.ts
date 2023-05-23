/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { reuseInFlight } from "async-await-utils/hof";

import { executeCode } from "@cocalc/backend/execute-code";
import { getLogger } from "@cocalc/backend/logger";
import processKill from "@cocalc/backend/misc/process-kill";
import { abspath, enable_mesg } from "@cocalc/backend/misc_node";
import type {
  Type as TCPMesgType,
  Message as TCPMessage,
} from "@cocalc/backend/tcp/enable-messaging-protocol";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import { connectToLockedSocket } from "@cocalc/backend/tcp/locked-socket";
import * as message from "@cocalc/util/message";
import {
  bind_methods,
  path_split,
  retry_until_success,
  to_json,
  trunc,
  trunc_middle,
  uuid,
} from "@cocalc/util/misc";
import { CB } from "@cocalc/util/types/callback";
import { ExecuteCodeOutput } from "@cocalc/util/types/execute-code";
import { ISageSession } from "@cocalc/util/types/sage";
import { Client } from "./client";
import * as common from "./common";
import { forget_port, get_port } from "./port_manager";
import { getSecretToken } from "./servers/secret-token";
const winston = getLogger("sage-session");

//##############################################
// Direct Sage socket session -- used internally in local hub, e.g., to assist CodeMirror editors...
//##############################################

// Wait up to this long for the Sage server to start responding
// connection requests, after we restart it.  It can
// take a while, since it pre-imports the sage library
// at startup, before forking.
const SAGE_SERVER_MAX_STARTUP_TIME_S = 60;

let _restarting_sage_server = false;
let _restarted_sage_server = 0; // time when we last restarted it

async function restart_sage_server() {
  const dbg = (m) => winston.debug(`restart_sage_server: ${to_json(m)}`);
  if (_restarting_sage_server) {
    dbg("hit lock");
    throw new Error("already restarting sage server");
  }
  const t = Date.now() - _restarted_sage_server;
  if (t <= SAGE_SERVER_MAX_STARTUP_TIME_S * 1000) {
    const err = `restarted sage server ${t}ms ago: not allowing too many restarts too quickly...`;
    dbg(err);
    throw err;
  }

  _restarting_sage_server = true;
  dbg("restarting the daemon");
  try {
    const output: ExecuteCodeOutput = await executeCode({
      command: "smc-sage-server restart",
      timeout: 45,
      ulimit_timeout: false, // very important -- so doesn't kill after 30 seconds of cpu!
      err_on_exit: true,
      bash: true,
    });
    {
      dbg(
        `successfully restarted sage server daemon -- '${JSON.stringify(
          output
        )}'`
      );
    }
    _restarting_sage_server = false;
    _restarted_sage_server = Date.now();
  } catch (err) {
    dbg(`failed to restart sage server daemon -- ${err}`);
    throw err;
  }
}

// Get a new connection to the Sage server.  If the server
// isn't running, e.g., it was killed due to running out of memory,
// attempt to restart it and try to connect.
async function get_sage_socket(): Promise<CoCalcSocket> {
  let socket: CoCalcSocket | undefined = undefined;
  const dbg = (m: string) => winston.debug(`get_sage_socket: ${m}`);
  let n = 0;

  const try_to_connect = async (cb: CB): Promise<void> => {
    try {
      dbg(`try ${n++} -- calling _get_sage_socket}`);
      socket = await _get_sage_socket();
    } catch (err) {
      // Failed for some reason: try to restart one time, then try again.
      // We do this because the Sage server can easily get killed due to out of memory conditions.
      // But we don't constantly try to restart the server, since it can easily fail to start if
      // there is something wrong with a local Sage install.
      // Note that restarting the sage server doesn't impact currently running worksheets (they
      // have their own process that isn't killed).
      try {
        dbg(`try ${n} -- failed -- calling restart_sage_server`);
        await restart_sage_server();
        // success at restarting sage server: *IMMEDIATELY* try to connect
        dbg(
          `try ${n} -- restart_sage_server succeeded -- calling _get_sage_socket`
        );
        socket = await _get_sage_socket();
      } catch (err) {
        // won't actually try to restart if called too recently.
        dbg(`try ${n} -- restart_sage_server failed -- calling cb(err)`);
        cb(err);
      }
    }
  };

  await new Promise<CoCalcSocket>((resolve, reject) => {
    retry_until_success({
      f: try_to_connect,
      start_delay: 50,
      max_delay: 5000,
      factor: 1.5,
      max_time: SAGE_SERVER_MAX_STARTUP_TIME_S * 1000,
      log(m) {
        return winston.debug(`get_sage_socket: ${m}`);
      },
      cb(err?: Error) {
        if (err) {
          reject(err);
        } else if (socket == null) {
          reject(new Error("socket is null"));
        } else {
          dbg(
            `try ${n} -- success -- calling resolve(socket) -- ${
              socket != null
            }`
          );
          resolve(socket);
        }
      },
    });
  });

  if (socket == null) {
    dbg(`socket is null -- throwing error`);
    throw new Error("socket is null");
  }

  return socket;
}

async function _get_sage_socket(): Promise<CoCalcSocket> {
  // cb(err, socket that is ready to use)
  let sage_socket: CoCalcSocket | undefined = undefined;

  winston.debug("get sage server port");
  const port: number | undefined = await get_port("sage");

  if (typeof port !== "number") {
    throw new Error("port not set");
  }
  winston.debug("get and unlock socket");
  try {
    sage_socket = await connectToLockedSocket({
      port,
      token: getSecretToken(),
    });
    winston.debug("Successfully unlocked a sage session connection.");
  } catch (error) {
    const err = error;
    forget_port("sage");
    winston.debug(
      `unlock socket: _new_session: sage session denied connection: ${err}`
    );
    throw new Error(`_new_session: sage session denied connection: ${err}`);
  }

  if (sage_socket == null) {
    throw new Error("sage_socket not set");
  }
  winston.debug("request sage session from server.");
  enable_mesg(sage_socket);
  sage_socket.write_mesg("json", message.start_session({ type: "sage" }));
  winston.debug(
    "Waiting to read one JSON message back, which will describe the session...."
  );

  // TODO: couldn't this just hang forever :-(
  return new Promise<CoCalcSocket>((resolve, reject) => {
    if (sage_socket == null) {
      reject("sage_socket not set");
      return;
    }
    sage_socket.once("mesg", (_type, desc) => {
      winston.debug(`Got message back from Sage server: ${common.json(desc)}`);
      if (sage_socket == null) {
        reject("sage_socket not set");
        return;
      }
      sage_socket.pid = desc.pid;
      resolve(sage_socket);
    });
  });
}

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

//# TODO for project-info/server we need a function that returns a path to a sage worksheet for a given PID
//exports.get_sage_path = (pid) ->
//    return path

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
    const { path, client } = opts;
    this.dbg("constructor")();
    this._path = path;
    this._client = client;
    this._output_cb = {};
    bind_methods(this);
    this.init_socket = reuseInFlight(this._init_socket).bind(this);
  }

  private dbg(f: string) {
    return (m?: string) =>
      winston.debug(`SageSession(path='${this._path}').${f}: ${m ?? ""}`);
  }

  public close() {
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
  public is_running(): boolean {
    return this._socket != null;
  }

  // NOTE: There can be many simultaneous init_socket calls at the same time,
  // if e.g., the socket doesn't exist and there are a bunch of calls to @call
  // at the same time.
  // See https://github.com/sagemathinc/cocalc/issues/3506
  private async _init_socket() {
    const dbg = this.dbg("init_socket()");
    dbg();

    try {
      const socket: CoCalcSocket = await get_sage_socket();

      dbg("successfully opened a sage session");
      this._socket = socket;

      socket.on("end", () => {
        delete this._socket;
        dbg("codemirror session terminated");
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
      dbg(`fail -- ${err}.`);
      throw err;
    }
  }

  private async _init_path(): Promise<void> {
    const dbg = this.dbg("_init_path()");
    dbg();
    return new Promise<void>(async (resolve, reject) => {
      await this.call({
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
          dbg(`got response: ${to_json(resp)}`);
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

  public async call({
    input,
    cb,
  }: {
    input: {
      id?: string;
      signal?: any;
      value?: any;
      event?: any; // should be something like: string | { sage_raw_input: string };
      code?: string;
      data?: { path: string; file: string };
      preparse?: boolean;
    };
    // cb(resp) or cb(resp1), cb(resp2), etc. -- posssibly called multiple times when message is execute or 0 times
    cb: (resp: {
      error?: Error;
      pong?: boolean;
      running?: boolean;
      stderr?: string;
      done?: boolean;
    }) => void;
  }): Promise<void> {
    const dbg = this.dbg("call");
    dbg(`input='${trunc(to_json(input), 300)}'`);
    switch (input.event) {
      case "ping":
        cb?.({ pong: true });
        return;

      case "status":
        cb?.({ running: this.is_running() });
        return;

      case "signal":
        if (this._socket != null) {
          dbg(`sending signal ${input.signal} to process ${this._socket.pid}`);
          const pid = this._socket.pid;
          if (pid != null) processKill(pid, input.signal);
        }
        cb?.({});
        return;

      case "restart":
        dbg("restarting sage session");
        if (this._socket != null) {
          this.close();
        }
        try {
          await this.init_socket();
          cb?.({});
        } catch (err) {
          cb?.({ error: err });
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
          if (this._socket != null) {
            await this.init_socket();
          }

          if (this._socket == null) {
            throw new Error("no socket"); // should not happen
          }

          if (input.id == null) {
            input.id = uuid();
            dbg(`generated new random uuid for input: '${input.id}' `);
          }

          this._socket.write_mesg("json", input);

          if (cb != null) {
            this._output_cb[input.id] = cb; // this is when opts.cb will get called...
          }
        } catch (err) {
          cb?.({ done: true, error: err });
        }
    }
  }

  private _handle_mesg_blob(mesg: TCPMessage) {
    let { uuid, blob } = mesg;
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

    return this._client.save_blob({
      blob,
      uuid,
      cb: (err, resp) => {
        if (err) {
          resp = message.save_blob({
            error: err,
            sha1: uuid, // dumb - that sha1 should be called uuid...
          });
        }
        return this._socket?.write_mesg("json", resp);
      },
    });
  }

  private _handle_mesg_json(mesg: TCPMessage) {
    const dbg = this.dbg("_handle_mesg_json");
    dbg(`mesg='${trunc_middle(to_json(mesg), 400)}'`);
    if (mesg == null) return; // should not happen
    const { id } = mesg;
    if (id == null) return; // should not happen
    const c = this._output_cb[id];
    if (c != null) {
      // Must do this check first since it uses done:false.
      if (mesg.done || mesg.done == null) {
        delete this._output_cb[id];
        mesg.done = true;
      }
      if (mesg.done != null && !mesg.done) {
        // waste of space to include done part of mesg if just false for everything else...
        delete mesg.done;
      }
      return c(mesg);
    }
  }
}
