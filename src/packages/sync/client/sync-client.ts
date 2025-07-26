/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Functionality related to Sync.
*/

import { once } from "@cocalc/util/async-utils";
import { SyncDoc, SyncOpts0 } from "@cocalc/sync/editor/generic/sync-doc";
import { SyncDBOpts0 } from "@cocalc/sync/editor/db";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import {
  synctable,
  SyncTable,
  Query,
  QueryOptions,
  synctable_no_changefeed,
} from "@cocalc/sync/table";
import type { AppClient } from "./types";

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

  public sync_string(_opts: SyncOpts): SyncString {
    throw Error("deprecated");
  }

  public sync_db(_opts: SyncDBOpts): SyncDoc {
    throw Error("deprecated");
  }
}
