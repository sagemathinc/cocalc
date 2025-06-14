/*
A SyncClient implementation that ONLY requires a valid Conat Client instance to
work. This makes it possible for any two clients connected to a Conat network to use
a document together collaboratively.

Any functionality involving the filesystem obviously is a no-op.

!WORK IN PROGRESS!
*/

import { EventEmitter } from "events";
import { type Client as SyncClient } from "@cocalc/sync/client/types";
import { SyncTable } from "@cocalc/sync/table/synctable";
import { once } from "@cocalc/util/async-utils";
import { FileWatcher } from "@cocalc/sync/editor/string/test/client-test";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { getLogger } from "@cocalc/conat/client";
import { parseQueryWithOptions } from "@cocalc/sync/table/util";
import { PubSub } from "@cocalc/conat/sync/pubsub";

const logger = getLogger("conat-sync-client");

export class ConatSyncClient extends EventEmitter implements SyncClient {
  constructor(private client: ConatClient) {
    super();
  }

  synctable_conat = async (query0, options?): Promise<SyncTable> => {
    const { query } = parseQueryWithOptions(query0, options);
    return (await this.client.sync.synctable({
      ...options,
      query,
    })) as any;
  };

  pubsub_conat = async (opts) => {
    return new PubSub({ client: this.client, ...opts });
  };

  // account_id or project_id
  client_id = (): string => {
    return this.client.id;
  };

  server_time = (): Date => {
    return new Date();
  };

  isTestClient = () => {
    return false;
  };

  is_project = (): boolean => {
    return false;
  };

  is_browser = (): boolean => {
    // most generic -- no filesystem assumption
    return true;
  };

  is_compute_server = (): boolean => {
    return false;
  };

  dbg = (f: string): Function => {
    return (...args) => logger.debug(f, ...args);
  };

  log_error = (_opts): void => {};

  query = (_opts): void => {};

  is_connected = (): boolean => {
    return true;
  };

  is_signed_in = (): boolean => {
    return true;
  };

  //
  // filesystem stuff that is assumed to be defined but not used...
  //
  mark_file = (_opts: {
    project_id: string;
    path: string;
    action: string;
    ttl: number;
  }) => {};

  path_access = (opts: { path: string; mode: string; cb: Function }): void => {
    opts.cb(true);
  };

  path_exists = (opts: { path: string; cb: Function }): void => {
    opts.cb(true);
  };
  path_stat = (opts: { path: string; cb: Function }): void => {
    opts.cb(true);
  };

  path_read = async (opts: {
    path: string;
    maxsize_MB?: number;
    cb: Function;
  }): Promise<void> => {
    opts.cb(true);
  };
  write_file = async (opts: {
    path: string;
    data: string;
    cb: Function;
  }): Promise<void> => {
    opts.cb(true);
  };
  watch_file = (opts: { path: string }): FileWatcher => {
    return new FileWatcher(opts.path);
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

  sage_session = (_opts): void => {};

  shell = (_opts): void => {};
}
