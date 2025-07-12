/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Client with filesystem access that can run in new services
and provide document sync functionality built on Conat.
*/

import { EventEmitter } from "events";
import type { Client as ConatClient } from "@cocalc/conat/core/client";
import {
  Client as Client0,
  FileWatcher as FileWatcher0,
} from "@cocalc/sync/editor/generic/types";
import { SyncTable } from "@cocalc/sync/table/synctable";
import { ExecuteCodeOptionsWithCallback } from "@cocalc/util/types/execute-code";
import { once } from "@cocalc/util/async-utils";
import { FileSystemClient } from "@cocalc/backend/sync-doc/client-fs";

export class Client extends EventEmitter implements Client0 {
  private filesystemClient = new FileSystemClient();

  write_file = this.filesystemClient.write_file;
  path_read = this.filesystemClient.path_read;
  path_stat = this.filesystemClient.path_stat;
  path_exists = this.filesystemClient.path_exists;
  file_size_async = this.filesystemClient.file_size_async;
  file_stat_async = this.filesystemClient.file_stat_async;
  watch_file = this.filesystemClient.watch_file;
  path_access = this.filesystemClient.path_access;

  constructor(private conat: ConatClient) {
    super();
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
    return (..._) => {};
  };

  mark_file = (_opts: {
    project_id: string;
    path: string;
    action: string;
    ttl: number;
  }): void => {};

  log_error = (opts: {
    project_id: string;
    path: string;
    string_id: string;
    error: any;
  }): void => {
    console.log("log_error", opts);
  };

  query = (opts): void => {
    opts.cb("not implemented");
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
