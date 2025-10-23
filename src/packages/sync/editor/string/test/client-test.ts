/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Minimal client class that we use for testing.
*/

import { EventEmitter } from "events";
import { bind_methods, keys } from "@cocalc/util/misc";
import {
  Client as Client0,
  FileWatcher as FileWatcher0,
} from "../../generic/types";
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
    bind_methods(this, ["query", "dbg", "query_cancel"]);
  }

  public server_time(): Date {
    return new Date();
  }

  isTestClient = () => {
    return true;
  };

  public is_project(): boolean {
    return false;
  }

  public is_browser(): boolean {
    return true;
  }

  public is_compute_server(): boolean {
    return false;
  }

  public dbg(_f: string): Function {
    //     return (...args) => {
    //       console.log(_f, ...args);
    //     };
    return (..._) => {};
  }

  public mark_file(_opts: {
    project_id: string;
    path: string;
    action: string;
    ttl: number;
  }): void {
    //console.log("mark_file", opts);
  }

  public log_error(opts: {
    project_id: string;
    path: string;
    string_id: string;
    error: any;
  }): void {
    console.log("log_error", opts);
  }

  public query(opts): void {
    if (opts.options && opts.options.length === 1 && opts.options[0].set) {
      // set query
      this.set_queries.push(opts);
      opts.cb();
    } else {
      // get query -- returns predetermined result
      const table = keys(opts.query)[0];
      let result = this.initial_get_query[table];
      if (result == null) {
        result = [];
      }
      //console.log("GET QUERY ", table, result);
      opts.cb(undefined, { query: { [table]: result } });
    }
  }

  path_access(opts: { path: string; mode: string; cb: Function }): void {
    console.log("path_access", opts.path, opts.mode);
    opts.cb(true);
  }
  path_exists(opts: { path: string; cb: Function }): void {
    console.log("path_access", opts.path);
    opts.cb(true);
  }
  path_stat(opts: { path: string; cb: Function }): void {
    console.log("path_state", opts.path);
    opts.cb(true);
  }
  async path_read(opts: {
    path: string;
    maxsize_MB?: number;
    cb: Function;
  }): Promise<void> {
    console.log("path_ready", opts.path);
    opts.cb(true);
  }
  async write_file(opts: {
    path: string;
    data: string;
    cb: Function;
  }): Promise<void> {
    console.log("write_file", opts.path, opts.data);
    opts.cb(true);
  }
  watch_file(opts: { path: string }): FileWatcher {
    return new FileWatcher(opts.path);
  }

  public is_connected(): boolean {
    return true;
  }

  public is_signed_in(): boolean {
    return true;
  }

  public touch_project(_): void {}

  public query_cancel(_): void {}

  public alert_message(_): void {}

  public is_deleted(_filename: string, _project_id?: string): boolean {
    return false;
  }

  public set_deleted(_filename: string, _project_id?: string): void {}

  async synctable_ephemeral(
    _project_id: string,
    query: any,
    options: any,
    throttle_changes?: number,
  ): Promise<SyncTable> {
    const s = new SyncTable(query, options, this, throttle_changes);
    await once(s, "connected");
    return s;
  }

  async synctable_conat(_query: any): Promise<SyncTable> {
    throw Error("synctable_conat: not implemented");
  }
  async pubsub_conat(_query: any): Promise<SyncTable> {
    throw Error("pubsub_conat: not implemented");
  }

  // account_id or project_id
  public client_id(): string {
    return this._client_id;
  }

  public sage_session({ path }): void {
    console.log(`sage_session: path=${path}`);
  }

  public shell(opts: ExecuteCodeOptionsWithCallback): void {
    console.log(`shell: opts=${JSON.stringify(opts)}`);
  }
}

class Filesystem {
  readFile = () => "";
  writeFile = () => {};
  utimes = () => {};
}

export const fs = new Filesystem() as any;
