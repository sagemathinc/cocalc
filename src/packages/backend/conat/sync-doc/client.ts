/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import {
  Client as Client0,
  FileWatcher as FileWatcher0,
} from "@cocalc/sync/editor/generic/types";
import { conat as conat0 } from "@cocalc/backend/conat/conat";
import { parseQueryWithOptions } from "@cocalc/sync/table/util";
import { PubSub } from "@cocalc/conat/sync/pubsub";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { type ConatSyncTable } from "@cocalc/conat/sync/synctable";

export class FileWatcher extends EventEmitter implements FileWatcher0 {
  private path: string;
  constructor(path: string) {
    super();
    this.path = path;
    console.log("FileWatcher", this.path);
  }
  close(): void {}
}

export class Client extends EventEmitter implements Client0 {
  private conat: ConatClient;
  constructor(conat?: ConatClient) {
    super();
    this.conat = conat ?? conat0();
  }

  is_project = (): boolean => false;
  is_browser = (): boolean => true;
  is_compute_server = (): boolean => false;

  dbg = (_f: string) => {
    return (..._) => {};
  };

  is_connected = (): boolean => {
    return this.conat.isConnected();
  };

  is_signed_in = (): boolean => {
    return this.conat.isSignedIn();
  };

  touch_project = (_): void => {};

  is_deleted = (_filename: string, _project_id?: string): boolean => {
    return false;
  };

  set_deleted = (_filename: string, _project_id?: string): void => {};

  synctable_conat = async (query0, options?): Promise<ConatSyncTable> => {
    const { query } = parseQueryWithOptions(query0, options);
    return await this.conat.sync.synctable({
      ...options,
      query,
    });
  };

  pubsub_conat = async (opts): Promise<PubSub> => {
    return new PubSub({ client: this.conat, ...opts });
  };

  // account_id or project_id
  client_id = (): string => this.conat.id;

  server_time = (): Date => {
    return new Date();
  };

  /////////////////////////////////
  // EVERYTHING BELOW: TO REMOVE?
  mark_file = (_): void => {};

  alert_message = (_): void => {};

  sage_session = (_): void => {};

  shell = (_): void => {};

  path_access = (opts: { path: string; mode: string; cb: Function }): void => {
    console.log("path_access", opts.path, opts.mode);
    opts.cb(true);
  };
  path_stat = (opts: { path: string; cb: Function }): void => {
    console.log("path_state", opts.path);
    opts.cb(true);
  };

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

  log_error = (_): void => {};

  query = (_): void => {
    throw Error("not implemented");
  };
  query_cancel = (_): void => {};
}
