/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
import {
  readFile as readFileAsync,
  stat as statFileAsync,
  writeFile,
} from "node:fs/promises";
import { join, join as path_join } from "node:path";

import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import { execute_code, uuidsha1 } from "@cocalc/backend/misc_node";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import * as synctable2 from "@cocalc/sync/table";
import { callback2, once } from "@cocalc/util/async-utils";
import { PROJECT_HUB_HEARTBEAT_INTERVAL_S } from "@cocalc/util/heartbeat";
import * as message from "@cocalc/util/message";
import * as misc from "@cocalc/util/misc";
import { defaults, required } from "@cocalc/util/misc";
import { CB } from "@cocalc/util/types/callback";
import * as blobs from "./blobs";
import { symmetric_channel } from "./browser-websocket/symmetric_channel";
import { json } from "./common";
import * as data from "./data";
import * as jupyter from "./jupyter/jupyter";
import { get_kernel_data } from "./jupyter/kernel-data";
import * as kucalc from "./kucalc";
import * as sage_session from "./sage_session";
import { get_listings_table } from "./sync/listings";
import { get_synctable } from "./sync/open-synctables";
import { get_syncdoc } from "./sync/sync-doc";
import { Watcher } from "./watcher";

import { getLogger } from "./logger";
const winston = getLogger("project:client");

const HOME = process.env.HOME ?? "/home/user";

let DEBUG = false;
// Easy way to enable debugging in any project anywhere.
const DEBUG_FILE = join(HOME, ".smc-DEBUG");
if (fs.existsSync(DEBUG_FILE)) {
  DEBUG = true;
} else if (kucalc.IN_KUCALC) {
  // always make verbose in kucalc, since logs are taken care of by the k8s
  // logging infrastructure...
  DEBUG = true;
}

export let client: Client;

export function init() {
  client = new Client();
  return client;
}

let ALREADY_CREATED = false;

export class Client extends EventEmitter {
  private project_id: string;
  private _connected: boolean;

  private _hub_callbacks: {
    [key: string]: CB<any, { event: "error"; error?: string }>;
  };
  private _hub_client_sockets: any;
  private _changefeed_sockets: any;

  private _open_syncstrings?: { [key: string]: SyncString };
  private _file_io_lock?: { [key: string]: number }; // file → timestamps

  constructor() {
    super();
    if (ALREADY_CREATED) {
      throw Error("BUG: Client already created!");
    }
    ALREADY_CREATED = true;
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
  }

  // use to define a logging function that is cleanly used internally
  public dbg(f, trunc = 1000) {
    if (DEBUG && winston) {
      return (...m) => {
        let s;
        switch (m.length) {
          case 0:
            s = "";
            break;
          case 1:
            s = m[0];
            break;
          default:
            s = JSON.stringify(m);
        }
        return winston.debug(`Client.${f}: ${misc.trunc_middle(s, trunc)}`);
      };
    } else {
      return function (..._) {};
    }
  }

  public alert_message(opts) {
    opts = defaults(opts, {
      type: "default",
      title: undefined,
      message: required,
      block: undefined,
      timeout: undefined,
    }); // time in seconds
    return this.dbg("alert_message")(opts.title, opts.message);
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
  public active_socket(socket) {
    const dbg = this.dbg(
      `active_socket(id=${socket.id},ip='${socket.remoteAddress}')`
    );
    let x = this._hub_client_sockets[socket.id];
    if (x == null) {
      dbg();
      x = this._hub_client_sockets[socket.id] = {
        socket,
        callbacks: {},
        activity: new Date(),
      };
      const locals: { heartbeat_interval?: NodeJS.Timer } = {
        heartbeat_interval: undefined,
      };
      const socket_end = () => {
        let id;
        if (locals.heartbeat_interval == null) {
          return;
        }
        dbg("ending socket");
        clearInterval(locals.heartbeat_interval);
        locals.heartbeat_interval = undefined;
        if (x.callbacks != null) {
          for (id in x.callbacks) {
            const cb = x.callbacks[id];
            cb?.("socket closed");
          }
          delete x.callbacks; // so additional trigger of end doesn't do anything
        }
        delete this._hub_client_sockets[socket.id];
        dbg(
          `number of active sockets now equals ${misc.len(
            this._hub_client_sockets
          )}`
        );
        if (misc.len(this._hub_client_sockets) === 0) {
          this._connected = false;
          dbg("lost all active sockets");
          this.emit("disconnected");
        }
        return socket.end();
      };

      socket.on("end", socket_end);
      socket.on("error", socket_end);

      const check_heartbeat = () => {
        if (
          socket.heartbeat == null ||
          Date.now() - socket.heartbeat >=
            1.5 * PROJECT_HUB_HEARTBEAT_INTERVAL_S * 1000
        ) {
          dbg("heartbeat failed");
          return socket_end();
        } else {
          return dbg("heartbeat -- socket is working");
        }
      };

      locals.heartbeat_interval = setInterval(
        check_heartbeat,
        1.5 * PROJECT_HUB_HEARTBEAT_INTERVAL_S * 1000
      );

      if (misc.len(this._hub_client_sockets) >= 1) {
        dbg("CONNECTED!");
        this._connected = true;
        return this.emit("connected");
      }
    } else {
      return (x.activity = new Date());
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
        delete this._hub_client_sockets[socket.id].callbacks[mesg.id];
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
      `there are ${socket_ids.length} sockets -- ${JSON.stringify(socket_ids)}`
    );
    if (socket_ids.length === 0) {
      return;
    }
    return this._hub_client_sockets[misc.random_choice(socket_ids)].socket;
  }

  // Send a message to some hub server and await a response (if cb defined).
  public call(opts: {
    message: any;
    timeout?: number;
    socket?: CoCalcSocket;
    cb?: CB<any, string>;
  }) {
    opts = defaults(opts, {
      message: required,
      timeout: undefined, // timeout in seconds; if specified call will error out after this much time
      socket: undefined, // if specified, use this socket
      cb: undefined,
    }); // awaits response if given
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
      this._hub_client_sockets[socket.id].callbacks[opts.message.id] = cb;
    }
    // Finally, send the message
    return socket.write_mesg("json", opts.message);
  }

  // Do a project_query
  public query(opts: {
    query: any;
    options?: { [key: string]: any }[];
    changes?: boolean;
    timeout?: number;
    cb: CB<any, string>;
  }) {
    opts = defaults(opts, {
      query: required, // a query (see schema.coffee)
      changes: undefined, // whether or not to create a changefeed
      options: undefined, // options to the query, e.g., [{limit:5}] )
      standby: false, // **IGNORED**
      timeout: 30, // how long to wait for initial result
      cb: required,
    });
    if (opts.options != null && !misc.is_array(opts.options)) {
      throw Error("options must be an array");
      return;
    }
    const mesg = message.query({
      id: misc.uuid(),
      query: opts.query,
      options: opts.options,
      changes: opts.changes,
      multi_response: opts.changes,
    });
    const socket = this.get_hub_socket();
    if (socket == null) {
      // It will try later when one is available...
      opts.cb("no hub socket available");
      return;
    }
    if (opts.changes) {
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
        return opts.cb("socket-end");
      });
      socket.on("end", () => {
        return opts.cb("socket-end");
      });
    }
    return this.call({
      message: mesg,
      timeout: opts.timeout,
      socket,
      cb: opts.cb,
    });
  }

  // Cancel an outstanding changefeed query.
  private _query_cancel(opts: { id: string; cb?: CB }) {
    opts = defaults(opts, {
      id: required, // changefeed id
      cb: undefined,
    });
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

  // We leave in the project_id for consistency with the browser UI.
  // And maybe someday we'll have tables managed across projects (?).
  public async synctable_project(_project_id: string, query, _options) {
    // TODO: this is ONLY for syncstring tables (syncstrings, patches, cursors).
    // Also, options are ignored -- since we use whatever was selected by the frontend.
    const the_synctable = await get_synctable(query, this);
    // To provide same API, must also wait until done initializing.
    if (the_synctable.get_state() !== "connected") {
      await once(the_synctable, "connected");
    }
    if (the_synctable.get_state() !== "connected") {
      throw Error(
        "Bug -- state of synctable must be connected " + JSON.stringify(query)
      );
    }
    return the_synctable;
  }

  // WARNING: making two of the exact same sync_string or sync_db will definitely
  // lead to corruption!

  // Get the synchronized doc with the given path.  Returns undefined
  // if currently no such sync-doc.
  public syncdoc(opts: { path: string }): SyncDoc | undefined {
    opts = defaults(opts, { path: required });
    return get_syncdoc(opts.path);
  }

  public symmetric_channel(name) {
    return symmetric_channel(name);
  }

  // Write a file to a given path (relative to env.HOME) on disk; will create containing directory.
  // If file is currently being written or read in this process, will result in error (instead of silently corrupt data).
  public async write_file(opts: { path: string; data: string; cb: CB<void> }) {
    opts = defaults(opts, {
      path: required,
      data: required,
      cb: required,
    });
    const path = join(HOME, opts.path);
    if (this._file_io_lock == null) {
      this._file_io_lock = {};
    }
    const dbg = this.dbg(`write_file(path='${opts.path}')`);
    dbg();
    const now = Date.now();
    if (now - (this._file_io_lock[path] ?? 0) < 15000) {
      // lock automatically expires after 15 seconds (see https://github.com/sagemathinc/cocalc/issues/1147)
      dbg("LOCK");
      // Try again in about 1s.
      setTimeout(() => this.write_file(opts), 500 + 500 * Math.random());
      return;
    }
    this._file_io_lock[path] = now;
    dbg(`@_file_io_lock = ${misc.to_json(this._file_io_lock)}`);
    try {
      await ensureContainingDirectoryExists(path);
      await writeFile(path, opts.data);
      dbg("success");
      return opts.cb();
    } catch (error) {
      const err = error;
      dbg(`error -- ${err}`);
      return opts.cb(err);
    } finally {
      delete this._file_io_lock[path];
    }
  }

  // Read file as a string from disk.
  // If file is currently being written or read in this process,
  // will retry until it isn't, so we do not get an error and we
  // do NOT get silently corrupted data.
  public async path_read(opts: {
    path: string;
    maxsize_MB?: number;
    cb: CB<string>;
  }) {
    opts = defaults(opts, {
      path: required,
      maxsize_MB: undefined, // in megabytes; if given and file would be larger than this, then cb(err)
      cb: required,
    }); // cb(err, file content as string (not Buffer!))
    let content: string | undefined = undefined;
    const path = join(HOME, opts.path);
    const dbg = this.dbg(
      `path_read(path='${opts.path}', maxsize_MB=${opts.maxsize_MB})`
    );
    dbg();
    if (this._file_io_lock == null) {
      this._file_io_lock = {};
    }

    const now = Date.now();
    if (now - (this._file_io_lock[path] ?? 0) < 15000) {
      // lock expires after 15 seconds (see https://github.com/sagemathinc/cocalc/issues/1147)
      dbg("LOCK");
      // Try again in 1s.
      setTimeout(() => this.path_read(opts), 500 + 500 * Math.random());
      return;
    }
    this._file_io_lock[path] = now;

    dbg(`@_file_io_lock = ${misc.to_json(this._file_io_lock)}`);

    // checking filesize limitations
    if (opts.maxsize_MB != null) {
      dbg("check if file too big");
      let size: number | undefined = undefined;
      try {
        size = await this.file_size_async(opts.path);
      } catch (err) {
        dbg(`error checking -- ${err}`);
        throw err;
      }

      if (size > opts.maxsize_MB * 1000000) {
        dbg("file is too big!");
        throw new Error(
          `file '${opts.path}' size (=${
            size / 1000000
          }MB) too large (must be at most ${
            opts.maxsize_MB
          }MB); try opening it in a Terminal with vim instead or click Help in the upper right to open a support request`
        );
      } else {
        dbg("file is fine");
      }
    }

    // if the above passes, actually reading file

    try {
      const data = await readFileAsync(path);
      dbg("read file");
      content = data.toString();
    } catch (err) {
      dbg(`error reading file -- ${err}`);
      throw err;
    }

    // release lock
    if (this._file_io_lock) {
      delete this._file_io_lock[path];
    }

    opts.cb(undefined, content);
  }

  public path_access(opts) {
    opts = defaults(opts, {
      path: required, // string
      mode: required, // string -- sub-sequence of 'rwxf' -- see https://nodejs.org/api/fs.html#fs_class_fs_stats
      cb: required,
    }); // cb(err); err = if any access fails; err=undefined if all access is OK
    let access = 0;
    for (let s of opts.mode) {
      access |= fs[s.toUpperCase() + "_OK"];
    }
    return fs.access(opts.path, access, opts.cb);
  }

  // TODO: exists is deprecated.  "To check if a file exists
  // without manipulating it afterwards, fs.access() is
  // recommended."
  public path_exists(opts) {
    opts = defaults(opts, {
      path: required,
      cb: required,
    });
    const dbg = this.dbg(`checking if path (='${opts.path}') exists`);
    dbg();
    return fs.exists(opts.path, (exists) => {
      dbg(`returned ${exists}`);
      return opts.cb(undefined, exists);
    }); // err actually never happens with node.js, so we change api to be more consistent
  }

  public path_stat(opts) {
    // see https://nodejs.org/api/fs.html#fs_class_fs_stats
    opts = defaults(opts, {
      path: required,
      cb: required,
    });
    return fs.stat(opts.path, opts.cb);
  }

  // Size of file in bytes (divide by 1000 for K, by 10^6 for MB.)
  public file_size(opts) {
    opts = defaults(opts, {
      filename: required,
      cb: required,
    });
    return this.path_stat({
      path: opts.filename,
      cb: (err, stat) => {
        return opts.cb(err, stat?.size);
      },
    });
  }

  public async file_size_async(filename): Promise<number> {
    const stat = await this.file_stat_async(filename);
    return stat.size;
  }

  public async file_stat_async(filename: string): Promise<fs.Stats> {
    return await statFileAsync(filename);
  }

  // execute a command using the shell or a subprocess -- see docs for execute_code in misc_node.
  public shell(opts) {
    return execute_code(opts);
  }

  // return new sage session
  public sage_session(opts) {
    opts = defaults(opts, { path: required });
    return sage_session.sage_session({ path: opts.path, client: this });
  }

  // returns a Jupyter kernel session
  public jupyter_kernel(opts: jupyter.KernelParams) {
    opts.client = this;
    return jupyter.kernel(opts);
  }

  public async jupyter_kernel_info() {
    return await get_kernel_data();
  }

  // See the file watcher.coffee for docs
  public watch_file(opts) {
    opts = defaults(opts, {
      path: required,
      interval: 1500, // polling interval in ms
      debounce: 500,
    }); // don't fire until at least this many ms after the file has REMAINED UNCHANGED
    const path = path_join(HOME, opts.path);
    const dbg = this.dbg(`watch_file(path='${path}')`);
    dbg(`watching file '${path}'`);
    return new Watcher(path, opts.interval, opts.debounce);
  }

  // Save a blob to the central db blobstore.
  // The sha1 is optional.
  public save_blob(opts: {
    blob: Buffer;
    sha1?: string;
    uuid?: string;
    cb?: (err: string | undefined, resp?: any) => void;
  }) {
    let uuid;
    opts = defaults(opts, {
      blob: required, // Buffer of data
      sha1: undefined,
      uuid: undefined, // if given then uuid must be derived from sha1 hash
      cb: undefined,
    }); // (err, resp)
    if (opts.uuid != null) {
      ({ uuid } = opts);
    } else {
      uuid = uuidsha1(opts.blob, opts.sha1);
    }
    const dbg = this.dbg(`save_blob(uuid='${uuid}')`);
    const hub = this.get_hub_socket();
    if (hub == null) {
      dbg("fail -- no global hubs");
      opts.cb?.(
        "no global hubs are connected to the local hub, so nowhere to send file"
      );
      return;
    }
    dbg("sending blob mesg");
    hub.write_mesg("blob", { uuid, blob: opts.blob });
    dbg("waiting for response");
    blobs.receive_save_blob_message({
      sha1: uuid,
      cb: (resp) => {
        if (resp?.error) {
          dbg(`fail -- '${resp.error}'`);
          return opts.cb?.(resp.error, resp);
        } else {
          dbg("success");
          return opts.cb?.(undefined, resp);
        }
      },
    });
  }

  public get_blob(opts: {
    blob: Buffer;
    sha1?: string;
    uuid?: string;
    cb?: (err: string) => void;
  }) {
    opts = defaults(opts, {
      blob: required, // Buffer of data
      sha1: undefined,
      uuid: undefined, // if given is uuid derived from sha1
      cb: undefined,
    }); // (err, resp)
    const dbg = this.dbg("get_blob");
    dbg(opts.sha1);
    opts.cb?.("get_blob: not implemented");
  }

  // no-op; assumed async api
  touch_project(_project_id) {}

  async get_syncdoc_history(string_id: string, patches = false) {
    const dbg = this.dbg("get_syncdoc_history");
    dbg(string_id, patches);
    const mesg = message.get_syncdoc_history({
      string_id,
      patches,
    });
    return await callback2(this.call, { message: mesg });
  }

  // NOTE: returns false if the listings table isn't connected.
  public is_deleted(filename: string, _project_id: string) {
    // project_id is ignored, of course
    try {
      const listings = get_listings_table();
      if (listings == null) throw new Error("no listings table");
      return listings.is_deleted(filename);
    } catch (error1) {
      // is_deleted can raise an exception if the table is
      // not yet initialized, in which case we fall back
      // to actually looking.  We have to use existsSync
      // because is_deleted is not an async function.
      return !fs.existsSync(join(HOME, filename));
    }
  }

  public async set_deleted(filename: string, _project_id: string) {
    // project_id is ignored
    const listings = get_listings_table();
    return await listings?.set_deleted(filename);
  }
}
