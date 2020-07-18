/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Functionality related to Sync.
*/

import { callback2 } from "smc-util/async-utils";
import { once } from "smc-util/async-utils";
import { is_valid_uuid_string, merge } from "smc-util/misc2";
import { defaults, required } from "smc-util/misc";
import { SyncDoc, SyncOpts0 } from "smc-util/sync/editor/generic/sync-doc";
interface SyncOpts extends Omit<SyncOpts0, "client"> {}

import { SyncDB, SyncDBOpts0 } from "smc-util/sync/editor/db";
interface SyncDBOpts extends Omit<SyncDBOpts, "client"> {}

import { SyncString } from "smc-util/sync/editor/string/sync";
import {
  synctable,
  SyncTable,
  Query,
  QueryOptions,
  synctable_no_changefeed,
} from "smc-util/sync/table";

import { synctable_project } from "../project/websocket/synctable";
import { Channel } from "../project/websocket/types";

import { WebappClient } from "./client";

export class SyncClient {
  private client: WebappClient;

  constructor(client: WebappClient) {
    this.client = client;
  }

  public sync_table(
    query: Query,
    options: QueryOptions,
    throttle_changes?: number
  ): SyncTable {
    return synctable(query, options, this.client, throttle_changes);
  }

  public async synctable_database(
    query: Query,
    options: QueryOptions,
    throttle_changes?: number
  ): Promise<SyncTable> {
    const s = this.sync_table(query, options, throttle_changes);
    await once(s, "connected");
    return s;
  }

  public synctable_no_changefeed(
    query: Query,
    options: QueryOptions,
    throttle_changes?: number
  ): SyncTable {
    return synctable_no_changefeed(
      query,
      options,
      this.client,
      throttle_changes
    );
  }

  public async synctable_project(
    project_id: string,
    query: Query,
    options: QueryOptions,
    throttle_changes: number | undefined = undefined,
    id: string = ""
  ): Promise<SyncTable> {
    return await synctable_project({
      project_id,
      query,
      options,
      client: this.client,
      throttle_changes,
      id,
    });
  }

  // NOT currently used.
  public async symmetric_channel(
    name: string,
    project_id: string
  ): Promise<Channel> {
    if (!is_valid_uuid_string(project_id) || typeof name !== "string") {
      throw Error("project_id must be a valid uuid and name must be a string");
    }
    return (await this.client.project_client.api(project_id)).symmetric_channel(
      name
    );
  }

  public sync_string(opts: SyncOpts): SyncString {
    const opts0: SyncOpts0 = defaults(opts, {
      id: undefined,
      project_id: required,
      path: required,
      file_use_interval: "default",
      cursors: false,
      patch_interval: 1000,
      save_interval: 2000,
      persistent: false,
      data_server: undefined,
      client: this.client,
    });
    return new SyncString(opts0);
  }

  public sync_db(opts: SyncDBOpts): SyncDoc {
    const opts0: SyncDBOpts0 = defaults(opts, {
      id: undefined,
      project_id: required,
      path: required,
      file_use_interval: "default",
      cursors: false,
      patch_interval: 1000,
      save_interval: 2000,
      change_throttle: undefined,
      persistent: false,
      data_server: undefined,

      primary_keys: required,
      string_cols: [],

      client: this.client,
    });
    return new SyncDB(opts0);
  }

  public async open_existing_sync_document(opts: {
    project_id: string;
    path: string;
    data_server?: string;
    persistent?: boolean;
  }): Promise<SyncDoc | undefined> {
    const resp = await callback2(this.client.query, {
      query: {
        syncstrings: {
          project_id: opts.project_id,
          path: opts.path,
          doctype: null,
        },
      },
    });
    if (resp.event === "error") {
      throw Error(resp.error);
    }
    if (resp.query?.syncstrings == null) {
      throw Error(`no document '${opts.path}' in project '${opts.project_id}'`);
    }
    const doctype = JSON.parse(
      resp.query.syncstrings.doctype ?? '{"type":"string"}'
    );
    let opts2: any = {
      project_id: opts.project_id,
      path: opts.path,
    };
    if (opts.data_server) {
      opts2.data_server = opts.data_server;
    }
    if (opts.persistent) {
      opts2.persistent = opts.persistent;
    }
    if (doctype.opts != null) {
      opts2 = merge(opts2, doctype.opts);
    }
    const f = `sync_${doctype.type}`;
    return (this as any)[f](opts2);
  }

}
