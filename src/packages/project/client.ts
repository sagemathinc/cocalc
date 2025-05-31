/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
client.ts -- A project viewed as a client for a hub.

For security reasons, a project does initiate a TCP connection to a hub,
but rather hubs initiate TCP connections to projects:

 * MINUS: This makes various things more complicated, e.g., a project
   might not have any open connection to a hub, but still "want" to write
   something to the database; in such a case it is simply out of luck
   and must wait.

 * PLUS: Security is simpler since a hub initiates the connection to
   a project.   A hub doesn't have to receive TCP connections and decide
   whether or not to trust what is on the other end of those connections.

That said, this architecture could change, and very little code would change
as a result.
*/
import EventEmitter from "node:events";
import fs from "node:fs";
import { join } from "node:path";
import { FileSystemClient } from "@cocalc/sync-client/lib/client-fs";
import { execute_code, uuidsha1 } from "@cocalc/backend/misc_node";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import type { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import type { ProjectClient as ProjectClientInterface } from "@cocalc/sync/editor/generic/types";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import * as synctable2 from "@cocalc/sync/table";
import { callback2 } from "@cocalc/util/async-utils";
import { PROJECT_HUB_HEARTBEAT_INTERVAL_S } from "@cocalc/util/heartbeat";
import * as message from "@cocalc/util/message";
import * as misc from "@cocalc/util/misc";
import type { CB } from "@cocalc/util/types/callback";
import type { ExecuteCodeOptionsWithCallback } from "@cocalc/util/types/execute-code";
import * as blobs from "./blobs";
import { json } from "./common";
import * as data from "./data";
import initJupyter from "./jupyter/init";
import * as kucalc from "./kucalc";
import { getLogger } from "./logger";
import * as sage_session from "./sage_session";
import synctable_conat from "@cocalc/project/conat/synctable";
import pubsub from "@cocalc/project/conat/pubsub";
import type { ConatSyncTableFunction } from "@cocalc/conat/sync/synctable";
import {
  callConatService,
  createConatService,
  type CallConatServiceFunction,
  type CreateConatServiceFunction,
} from "@cocalc/conat/service";
import { connectToConat } from "./conat/connection";
import { getSyncDoc } from "@cocalc/project/conat/open-files";
import { isDeleted } from "@cocalc/project/conat/listings";

const winston = getLogger("client");

const HOME = process.env.HOME ?? "/home/user";

let DEBUG = !!kucalc.IN_KUCALC;

export function initDEBUG() {
  if (DEBUG) {
    return;
  }
  // // Easy way to enable debugging in any project anywhere.
  const DEBUG_FILE = join(HOME, ".smc-DEBUG");
  fs.access(DEBUG_FILE, (err) => {
    if (err) {
      // no file
      winston.info(
        "create this file to enable very verbose debugging:",
        DEBUG_FILE,
      );
      return;
    } else {
      DEBUG = true;
    }
    winston.info(`DEBUG = ${DEBUG}`);
  });
}

let client: Client | null = null;

export function init() {
  if (client != null) {
    return client;
  }
  client = new Client();
  return client;
}

export function getClient(): Client {
  if (client == null) {
    init();
  }
  if (client == null) {
    throw Error("BUG: Client not initialized!");
  }
  return client;
}

let ALREADY_CREATED = false;

type HubCB = CB<any, { event: "error"; error?: string }>;

export class Client extends EventEmitter implements ProjectClientInterface {
  public readonly project_id: string;
  private _connected: boolean;

  private _hub_callbacks: {
    [key: string]: HubCB;
  };
  private _hub_client_sockets: {
    [id: string]: {
      socket: CoCalcSocket;
      callbacks?: { [id: string]: HubCB | CB<any, string> };
      activity: Date;
    };
  };
  private _changefeed_sockets: any;
  private _open_syncstrings?: { [key: string]: SyncString };

  // use to define a logging function that is cleanly used internally
  dbg = (f: string) => {
    if (DEBUG && winston) {
      return (...m) => {
        return winston.debug(`Client.${f}`, ...m);
      };
    } else {
      return function (..._) {};
    }
  };

  private filesystemClient = new FileSystemClient();
  write_file = this.filesystemClient.write_file;
  path_read = this.filesystemClient.path_read;
  path_stat = this.filesystemClient.path_stat;
  file_size_async = this.filesystemClient.file_size_async;
  file_stat_async = this.filesystemClient.file_stat_async;
  watch_file = this.filesystemClient.watch_file;

  constructor() {
    super();
    if (ALREADY_CREATED) {
      throw Error("BUG: Client already created!");
    }
    ALREADY_CREATED = true;
    if (process.env.HOME != null) {
      // client assumes curdir is HOME
      process.chdir(process.env.HOME);
    }
    this.project_id = data.project_id;
    this.dbg("constructor")();
    this.setMaxListeners(300); // every open file/table/sync db listens for connect event, which adds up.
    // initialize two caches
    this._hub_callbacks = {};
    this._hub_client_sockets = {};
    this._changefeed_sockets = {};
    this._connected = false;

    // Start listening for syncstrings that have been recently modified, so that we
    // can open them and provide filesystem and computational support.
    // TODO: delete this code.
    //# @_init_recent_syncstrings_table()

    if (kucalc.IN_KUCALC) {
      kucalc.init(this);
    }

    misc.bind_methods(this);

    initJupyter();
  }

  public alert_message({
    type = "default",
    title,
    message,
  }: {
    type?: "default";
    title?: string;
    message: string;
    block?: boolean;
    timeout?: number; // time in seconds
  }): void {
    this.dbg("alert_message")(type, title, message);
  }

  // todo: more could be closed...
  public close(): void {
    if (this._open_syncstrings != null) {
      const object = misc.keys(this._open_syncstrings);
      for (let _ in object) {
        const s = this._open_syncstrings[_];
        s.close();
      }
      delete this._open_syncstrings;
    }
    //return clearInterval(this._recent_syncstrings_interval);
  }

  // account_id or project_id of this client
  public client_id(): string {
    return this.project_id;
  }

  public get_project_id(): string {
    return this.project_id;
  }

  // true since this client is a project
  public is_project(): boolean {
    return true;
  }

  public is_browser(): boolean {
    return false;
  }

  public is_compute_server(): boolean {
    return false;
  }

  // false since this client is not a user
  public is_user(): boolean {
    return false;
  }

  public is_signed_in(): boolean {
    return true;
  }

  public is_connected(): boolean {
    return this._connected;
  }

  // We trust the time on our own compute servers (unlike random user's browser).
  public server_time(): Date {
    return new Date();
  }

  // Declare that the given socket is active right now and can be used for
  // communication with some hub (the one the socket is connected to).
  public active_socket(socket: CoCalcSocket): void {
    const dbg = this.dbg(
      `active_socket(id=${socket.id},ip='${socket.remoteAddress}')`,
    );
    let x = this._hub_client_sockets[socket.id];
    if (x == null) {
      dbg();
      x = this._hub_client_sockets[socket.id] = {
        socket,
        callbacks: {},
        activity: new Date(),
      };
      let heartbeat_interval: ReturnType<typeof setInterval> | undefined =
        undefined;
      const socket_end = (): void => {
        if (heartbeat_interval == null) {
          // alrady destroyed it
          return;
        }
        dbg("ending socket");
        clearInterval(heartbeat_interval);
        heartbeat_interval = undefined;
        if (x.callbacks != null) {
          for (const id in x.callbacks) {
            // TODO: is this right?  Should we call the callback an {event:error} object?
            const cb = x.callbacks[id] as CB<any, string>;
            cb?.("socket closed");
          }
          delete x.callbacks; // so additional trigger of end doesn't do anything
        }
        delete this._hub_client_sockets[socket.id];
        dbg(
          `number of active sockets now equals ${misc.len(
            this._hub_client_sockets,
          )}`,
        );
        if (misc.len(this._hub_client_sockets) === 0) {
          this._connected = false;
          dbg("lost all active sockets");
          this.emit("disconnected");
        }
        socket.end();
        socket.destroy();
      };

      socket.on("end", socket_end);
      socket.on("error", socket_end);

      const check_heartbeat = (): void => {
        if (
          socket.heartbeat == null ||
          Date.now() - socket.heartbeat.getTime() >=
            1.5 * PROJECT_HUB_HEARTBEAT_INTERVAL_S * 1000
        ) {
          dbg("heartbeat failed");
          socket_end();
        } else {
          dbg("heartbeat -- socket is working");
        }
      };

      heartbeat_interval = setInterval(
        check_heartbeat,
        1.5 * PROJECT_HUB_HEARTBEAT_INTERVAL_S * 1000,
      );

      if (misc.len(this._hub_client_sockets) >= 1) {
        dbg("CONNECTED!");
        this._connected = true;
        this.emit("connected");
      }
    } else {
      x.activity = new Date();
    }
  }

  // Handle a mesg coming back from some hub. If we have a callback we call it
  // for the given message, then return true. Otherwise, return
  // false, meaning something else should try to handle this message.
  public handle_mesg(mesg, socket) {
    const dbg = this.dbg(`handle_mesg(${misc.trunc_middle(json(mesg), 512)})`);
    const f = this._hub_callbacks[mesg.id];
    if (f != null) {
      dbg("calling callback");
      if (!mesg.multi_response) {
        delete this._hub_callbacks[mesg.id];
        delete this._hub_client_sockets[socket.id].callbacks?.[mesg.id];
      }
      try {
        f(mesg);
      } catch (err) {
        dbg(`WARNING: error handling message from client. -- ${err}`);
      }
      return true;
    } else {
      dbg("no callback");
      return false;
    }
  }

  // Get a socket connection to the hub from one in our cache; choose one at random.
  // There is obviously no guarantee to get the same hub if you call this twice!
  // Returns undefined if there are currently no connections from any hub to us
  // (in which case, the project must wait).
  public get_hub_socket() {
    const socket_ids = misc.keys(this._hub_client_sockets);
    this.dbg("get_hub_socket")(
      `there are ${socket_ids.length} sockets -- ${JSON.stringify(socket_ids)}`,
    );
    if (socket_ids.length === 0) {
      return;
    }
    return this._hub_client_sockets[misc.random_choice(socket_ids)].socket;
  }

  // Send a message to some hub server and await a response (if cb defined).
  public call(opts: {
    message: any;
    timeout?: number; // timeout in seconds; if specified call will error out after this much time
    socket?: CoCalcSocket; // if specified, use this socket
    cb?: CB<any, string>; // awaits response if given
  }) {
    const dbg = this.dbg(`call(message=${json(opts.message)})`);
    dbg();
    const socket =
      opts.socket != null ? opts.socket : (opts.socket = this.get_hub_socket()); // set socket to best one if no socket specified
    if (socket == null) {
      dbg("no sockets");
      // currently, due to the security model, there's no way out of this; that will change...
      opts.cb?.("no hubs currently connected to this project");
      return;
    }
    if (opts.cb != null) {
      let timer;
      if (opts.timeout) {
        dbg("configure timeout");
        const fail = () => {
          dbg("failed");
          delete this._hub_callbacks[opts.message.id];
          opts.cb?.(`timeout after ${opts.timeout}s`);
          delete opts.cb;
        };
        timer = setTimeout(fail, opts.timeout * 1000);
      }
      if (opts.message.id == null) {
        opts.message.id = misc.uuid();
      }
      const cb = (this._hub_callbacks[opts.message.id] = (resp) => {
        //dbg("got response: #{misc.trunc(json(resp),400)}")
        if (timer != null) {
          clearTimeout(timer);
          timer = undefined;
        }
        if (resp?.event === "error") {
          opts.cb?.(resp.error ? resp.error : "error");
        } else {
          opts.cb?.(undefined, resp);
        }
      });
      const callbacks = this._hub_client_sockets[socket.id].callbacks;
      if (callbacks != null) {
        callbacks[opts.message.id] = cb;
      }
    }
    // Finally, send the message
    return socket.write_mesg("json", opts.message);
  }

  // Do a project_query
  public query({
    query,
    options,
    changes,
    //standby = false, // **IGNORED**
    timeout = 30,
    cb,
  }: {
    query: any; // a query (see schema.js)
    options?: { [key: string]: any }[]; // options to the query, e.g., [{limit:5}] )
    changes?: boolean; // whether or not to create a changefeed
    //standby: boolean; // **IGNORED**
    timeout: number; // how long in *seconds* wait for initial result from hub database call
    cb: CB<any, string>;
  }) {
    if (options != null && !misc.is_array(options)) {
      throw Error("options must be an array");
      return;
    }
    const mesg = message.query({
      id: misc.uuid(),
      query,
      options,
      changes,
      multi_response: changes,
    });
    const socket = this.get_hub_socket();
    if (socket == null) {
      // It will try later when one is available...
      cb("no hub socket available");
      return;
    }
    if (changes) {
      // Record socket for this changefeed in @_changefeed_sockets
      this._changefeed_sockets[mesg.id] = socket;
      // CRITICAL: On error or end, send an end error to the synctable, so that it will
      // attempt to reconnect (and also stop writing to the socket).
      // This is important, since for project clients
      // the disconnected event is only emitted when *all* connections from
      // hubs to the local_hub end.  If two connections s1 and s2 are open,
      // and s1 is used for a sync table, and s1 closes (e.g., hub1 is restarted),
      // then s2 is still open and no 'disconnected' event is emitted.  Nonetheless,
      // it's important for the project to consider the synctable broken and
      // try to reconnect it, which in this case it would do using s2.
      socket.on("error", () => {
        cb("socket-end");
      });
      socket.on("end", () => {
        cb("socket-end");
      });
    }
    return this.call({
      message: mesg,
      timeout,
      socket,
      cb,
    });
  }

  // Cancel an outstanding changefeed query.
  private _query_cancel(opts: { id: string; cb?: CB }) {
    const socket = this._changefeed_sockets[opts.id];
    if (socket == null) {
      // nothing to do
      return opts.cb?.();
    } else {
      return this.call({
        message: message.query_cancel({ id: opts.id }),
        timeout: 30,
        socket,
        cb: opts.cb,
      });
    }
  }

  // ASYNC version
  public async query_cancel(id) {
    return await callback2(this._query_cancel, { id });
  }

  public sync_table(query, options?: any, throttle_changes = undefined) {
    return synctable2.synctable(query, options, this, throttle_changes);
  }

  conat = async () => await connectToConat();

  synctable_conat: ConatSyncTableFunction = async (query, options?) => {
    return await synctable_conat(query, options);
  };

  pubsub_conat = async ({ path, name }: { path?: string; name: string }) => {
    return await pubsub({ path, name });
  };

  callConatService: CallConatServiceFunction = async (options) => {
    return await callConatService(options);
  };

  createConatService: CreateConatServiceFunction = (options) => {
    return createConatService({
      ...options,
      project_id: this.project_id,
    });
  };

  // WARNING: making two of the exact same sync_string or sync_db will definitely
  // lead to corruption!

  // Get the synchronized doc with the given path.  Returns undefined
  // if currently no such sync-doc.
  syncdoc = ({ path }: { path: string }): SyncDoc | undefined => {
    return getSyncDoc(path);
  };

  public path_access(opts: { path: string; mode: string; cb: CB }): void {
    // mode: sub-sequence of 'rwxf' -- see https://nodejs.org/api/fs.html#fs_class_fs_stats
    // cb(err); err = if any access fails; err=undefined if all access is OK
    let access = 0;
    for (let s of opts.mode) {
      access |= fs[s.toUpperCase() + "_OK"];
    }
    return fs.access(opts.path, access, opts.cb);
  }

  // TODO: exists is deprecated.  "To check if a file exists
  // without manipulating it afterwards, fs.access() is
  // recommended."
  public path_exists(opts: { path: string; cb: CB }) {
    const dbg = this.dbg(`checking if path (='${opts.path}') exists`);
    dbg();
    return fs.exists(opts.path, (exists) => {
      dbg(`returned ${exists}`);
      opts.cb(undefined, exists);
    }); // err actually never happens with node.js, so we change api to be more consistent
  }

  // Size of file in bytes (divide by 1000 for K, by 10^6 for MB.)
  public file_size(opts: { filename: string; cb: CB }): void {
    this.path_stat({
      path: opts.filename,
      cb: (err, stat) => {
        opts.cb(err, stat?.size);
      },
    });
  }

  // execute a command using the shell or a subprocess -- see docs for execute_code in misc_node.
  public shell(opts: ExecuteCodeOptionsWithCallback): void {
    execute_code(opts);
  }

  // return new sage session -- the code that actually calls this is in the @cocalc/sync package
  // in "packages/sync/editor/generic/evaluator.ts"
  public sage_session({
    path,
  }: {
    path: string; // the path to the *worksheet* file
  }): sage_session.SageSessionType {
    return sage_session.sage_session({ path, client: this });
  }

  // Save a blob to the central db blobstore.
  // The sha1 is optional.
  public save_blob({
    blob,
    sha1,
    uuid: optsUUID,
    cb,
  }: {
    blob: Buffer; // Buffer of data
    sha1?: string;
    uuid?: string; // if given then uuid must be derived from sha1 hash
    cb?: (err: string | undefined, resp?: any) => void;
  }) {
    const uuid = optsUUID ?? uuidsha1(blob, sha1);
    const dbg = this.dbg(`save_blob(uuid='${uuid}')`);
    const hub = this.get_hub_socket();
    if (hub == null) {
      dbg("fail -- no global hubs");
      cb?.(
        "no global hubs are connected to the local hub, so nowhere to send file",
      );
      return;
    }
    dbg("sending blob mesg");
    hub.write_mesg("blob", { uuid, blob });
    dbg("waiting for response");
    blobs.receive_save_blob_message({
      sha1: uuid,
      cb: (resp): void => {
        if (resp?.error) {
          dbg(`fail -- '${resp.error}'`);
          cb?.(resp.error, resp);
        } else {
          dbg("success");
          cb?.(undefined, resp);
        }
      },
    });
  }

  public get_blob(opts: {
    blob: Buffer; // Buffer of data
    sha1?: string;
    uuid?: string; // if given is uuid derived from sha1
    cb?: (err: string) => void; // (err, resp)
  }) {
    const dbg = this.dbg("get_blob");
    dbg(opts.sha1);
    opts.cb?.("get_blob: not implemented");
  }

  // no-op; assumed async api
  touch_project(_project_id: string, _compute_server_id?: number) {}

  // Return true if the file was explicitly deleted.
  // Returns unknown if don't know
  // Returns false if definitely not.
  public is_deleted(
    filename: string,
    _project_id: string,
  ): boolean | undefined {
    return isDeleted(filename);
  }

  public async set_deleted(
    _filename: string,
    _project_id?: string,
  ): Promise<void> {
    // DEPRECATED
    this.dbg("set_deleted: DEPRECATED");
  }
}
