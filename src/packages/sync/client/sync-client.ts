/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Functionality related to Sync.
*/

import { once } from "@cocalc/util/async-utils";
import { defaults, is_valid_uuid_string, required } from "@cocalc/util/misc";
import { SyncDoc, SyncOpts0 } from "@cocalc/sync/editor/generic/sync-doc";
import { SyncDB, SyncDBOpts0 } from "@cocalc/sync/editor/db";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import {
  synctable,
  SyncTable,
  Query,
  QueryOptions,
  synctable_no_changefeed,
} from "@cocalc/sync/table";
import synctable_project from "./synctable-project";
import type { Channel, AppClient } from "./types";
import { getSyncDocType } from "@cocalc/conat/sync/syncdoc-info";

import { refCacheSync } from "@cocalc/util/refcache";

interface SyncOpts extends Omit<SyncOpts0, "client"> {
  noCache?: boolean;
  client?: AppClient;
}

interface SyncDBOpts extends Omit<SyncDBOpts0, "client" | "string_cols"> {
  string_cols?: string[];
  noCache?: boolean;
  client?: AppClient;
}

export class SyncClient {
  private client: AppClient;

  constructor(client: AppClient) {
    this.client = client;
  }

  public sync_table(
    query: Query,
    options?: QueryOptions,
    throttle_changes?: number,
  ): SyncTable {
    return synctable(query, options ?? [], this.client, throttle_changes);
  }

  public async synctable_database(
    query: Query,
    options?: QueryOptions,
    throttle_changes?: number,
  ): Promise<SyncTable> {
    const s = this.sync_table(query, options ?? [], throttle_changes);
    await once(s, "connected");
    return s;
  }

  public synctable_no_changefeed(
    query: Query,
    options?: QueryOptions,
    throttle_changes?: number,
  ): SyncTable {
    return synctable_no_changefeed(
      query,
      options ?? [],
      this.client,
      throttle_changes,
    );
  }

  public async synctable_project(
    project_id: string,
    query: Query,
    options?: QueryOptions,
    throttle_changes?: number,
    id: string = "",
  ): Promise<SyncTable> {
    return await synctable_project({
      project_id,
      query,
      options: options ?? [],
      client: this.client,
      throttle_changes,
      id,
    });
  }

  // NOT currently used.
  public async symmetric_channel(
    name: string,
    project_id: string,
  ): Promise<Channel> {
    if (!is_valid_uuid_string(project_id) || typeof name !== "string") {
      throw Error("project_id must be a valid uuid and name must be a string");
    }
    return (await this.client.project_client.api(project_id)).symmetric_channel(
      name,
    );
  }

  public sync_string(opts: SyncOpts): SyncString {
    return syncstringCache({ ...opts, client: this.client });
  }

  public sync_db(opts: SyncDBOpts): SyncDB {
    return syncdbCache({ ...opts, client: this.client });
  }

  public async open_existing_sync_document({
    project_id,
    path,
    data_server,
    persistent,
  }: {
    project_id: string;
    path: string;
    data_server?: string;
    persistent?: boolean;
  }): Promise<SyncDoc | undefined> {
    const doctype = await getSyncDocType({
      project_id,
      path,
      client: this.client,
    });
    const { type } = doctype;
    const f = `sync_${type}`;
    return (this as any)[f]({
      project_id,
      path,
      data_server,
      persistent,
      ...doctype.opts,
    });
  }
}

const syncdbCache = refCacheSync<SyncDBOpts, SyncDB>({
  name: "syncdb",

  createKey: ({ project_id, path }: SyncDBOpts) => {
    return JSON.stringify({ project_id, path });
  },

  createObject: (opts: SyncDBOpts) => {
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

      client: required,

      ephemeral: false,
    });
    return new SyncDB(opts0);
  },
});

const syncstringCache = refCacheSync<SyncOpts, SyncString>({
  name: "syncstring",
  createKey: ({ project_id, path }: SyncOpts) => {
    const key = JSON.stringify({ project_id, path });
    return key;
  },

  createObject: (opts: SyncOpts) => {
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
      client: required,
      ephemeral: false,
    });
    return new SyncString(opts0);
  },
});
