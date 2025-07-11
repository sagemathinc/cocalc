/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Client with filesystem access that can run in new services
and provide document sync functionality built on Conat.
*/

import { EventEmitter } from "events";
import {
  Client as Client0,
  FileWatcher as FileWatcher0,
} from "@cocalc/sync/editor/generic/types";
import { SyncTable } from "@cocalc/sync/table/synctable";
import { ExecuteCodeOptionsWithCallback } from "@cocalc/util/types/execute-code";
import { once } from "@cocalc/util/async-utils";

export class FileWatcher extends EventEmitter implements FileWatcher0 {
  private path: string;
  constructor(path: string) {
    super();
    this.path = path;
    console.log("FileWatcher", this.path);
  }
  public close(): void {}
}

export class Client extends EventEmitter implements Client0 {
  private _client_id: string;
  private initial_get_query: { [table: string]: any[] };
  public set_queries: any[] = [];

  constructor(
    initial_get_query: { [table: string]: any[] },
    client_id: string,
  ) {
    super();
    this._client_id = client_id;
    this.initial_get_query = initial_get_query;
  }

  server_time = (): Date => {
    return new Date();
  };

  isTestClient = () => {
    return true;
  };

  is_project = (): boolean => {
    return false;
  };

  is_browser = (): boolean => {
    return true;
  };

  is_compute_server = (): boolean => {
    return false;
  };

  dbg = (_f: string): Function => {
    //     return (...args) => {
    //       console.log(_f, ...args);
    //     };
    return (..._) => {};
  };

  mark_file = (_opts: {
    project_id: string;
    path: string;
    action: string;
    ttl: number;
  }): void => {
    //console.log("mark_file", opts);
  };

  log_error = (opts: {
    project_id: string;
    path: string;
    string_id: string;
    error: any;
  }): void => {
    console.log("log_error", opts);
  };

  query = (opts): void => {
    if (opts.options && opts.options.length === 1 && opts.options[0].set) {
      // set query
      this.set_queries.push(opts);
      opts.cb();
    } else {
      // get query -- returns predetermined result
      const table = Object.keys(opts.query)[0];
      let result = this.initial_get_query[table];
      if (result == null) {
        result = [];
      }
      //console.log("GET QUERY ", table, result);
      opts.cb(undefined, { query: { [table]: result } });
    }
  };

  path_access = (opts: { path: string; mode: string; cb: Function }): void => {
    console.log("path_access", opts.path, opts.mode);
    opts.cb(true);
  };
  path_exists = (opts: { path: string; cb: Function }): void => {
    console.log("path_access", opts.path);
    opts.cb(true);
  };
  path_stat = (opts: { path: string; cb: Function }): void => {
    console.log("path_state", opts.path);
    opts.cb(true);
  };
  path_read = async (opts: {
    path: string;
    maxsize_MB?: number;
    cb: Function;
  }): Promise<void> => {
    console.log("path_ready", opts.path);
    opts.cb(true);
  };
  write_file = async (opts: {
    path: string;
    data: string;
    cb: Function;
  }): Promise<void> => {
    console.log("write_file", opts.path, opts.data);
    opts.cb(true);
  };
  watch_file = (opts: { path: string }): FileWatcher => {
    return new FileWatcher(opts.path);
  };

  is_connected = (): boolean => {
    return true;
  };

  is_signed_in = (): boolean => {
    return true;
  };

  touch_project = (_): void => {};

  query_cancel = (_): void => {};

  alert_message = (_): void => {};

  is_deleted = (_filename: string, _project_id?: string): boolean => {
    return false;
  };

  set_deleted = (_filename: string, _project_id?: string): void => {};

  synctable_ephemeral = async (
    _project_id: string,
    query: any,
    options: any,
    throttle_changes?: number,
  ): Promise<SyncTable> => {
    const s = new SyncTable(query, options, this, throttle_changes);
    await once(s, "connected");
    return s;
  };

  synctable_conat = async (_query: any): Promise<SyncTable> => {
    throw Error("synctable_conat: not implemented");
  };
  pubsub_conat = async (_query: any): Promise<SyncTable> => {
    throw Error("pubsub_conat: not implemented");
  };

  // account_id or project_id
  client_id = (): string => {
    return this._client_id;
  };

  sage_session = ({ path }): void => {
    console.log(`sage_session: path=${path}`);
  };

  shell = (opts: ExecuteCodeOptionsWithCallback): void => {
    console.log(`shell: opts=${JSON.stringify(opts)}`);
  };
}
