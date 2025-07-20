/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import { Client as Client0 } from "@cocalc/sync/editor/generic/types";
import { parseQueryWithOptions } from "@cocalc/sync/table/util";
import { PubSub } from "@cocalc/conat/sync/pubsub";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { type ConatSyncTable } from "@cocalc/conat/sync/synctable";

export class SyncClient extends EventEmitter implements Client0 {
  private client: ConatClient;
  constructor(client: ConatClient) {
    super();
    if (client == null) {
      throw Error("client must be specified");
    }
    this.client = client;
  }

  is_project = (): boolean => false;
  is_browser = (): boolean => true;
  is_compute_server = (): boolean => false;

  dbg = (_f: string) => {
    return (..._) => {};
  };

  is_connected = (): boolean => {
    return this.client.isConnected();
  };

  is_signed_in = (): boolean => {
    return this.client.isSignedIn();
  };

  touch_project = (_): void => {};

  is_deleted = (_filename: string, _project_id?: string): boolean => {
    return false;
  };

  set_deleted = (_filename: string, _project_id?: string): void => {};

  synctable_conat = async (query0, options?): Promise<ConatSyncTable> => {
    const { query } = parseQueryWithOptions(query0, options);
    return await this.client.sync.synctable({
      ...options,
      query,
    });
  };

  pubsub_conat = async (opts): Promise<PubSub> => {
    return new PubSub({ client: this.client, ...opts });
  };

  // account_id or project_id or hub_id or fallback client.id
  client_id = (): string => {
    const user = this.client.info?.user;
    return (
      user?.account_id ?? user?.project_id ?? user?.hub_id ?? this.client.id
    );
  };

  server_time = (): Date => {
    return new Date();
  };

  /////////////////////////////////
  // EVERYTHING BELOW: TO REMOVE?
  mark_file = (_): void => {};

  alert_message = (_): void => {};

  sage_session = (_): void => {};

  shell = (_): void => {};

  path_access = (opts): void => {
    opts.cb(true);
  };
  path_stat = (opts): void => {
    console.log("path_state", opts.path);
    opts.cb(true);
  };

  async path_read(opts): Promise<void> {
    opts.cb(true);
  }
  async write_file(opts): Promise<void> {
    opts.cb(true);
  }
  watch_file(_): any {}

  log_error = (_): void => {};

  query = (_): void => {
    throw Error("not implemented");
  };
  query_cancel = (_): void => {};
}
