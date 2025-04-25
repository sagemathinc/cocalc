/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { is_array } from "@cocalc/util/misc";
import { validate_client_query } from "@cocalc/util/schema-validate";
import { CB } from "@cocalc/util/types/database";
import { NatsChangefeed } from "@cocalc/sync/table/changefeed-nats2";
import { uuid } from "@cocalc/util/misc";
import { client_db } from "@cocalc/util/schema";

declare const $: any; // jQuery

export class QueryClient {
  private client: any;
  private changefeeds: { [id: string]: NatsChangefeed } = {};

  constructor(client: any) {
    this.client = client;
  }

  // This works like a normal async function when
  // opts.cb is NOT specified.  When opts.cb is specified,
  // it works like a cb and returns nothing.    For changefeeds
  // you MUST specify opts.cb, but can always optionally do so.
  public async query(opts: {
    query: object;
    options?: object[]; // if given must be an array of objects, e.g., [{limit:5}]
    changes?: boolean;
    cb?: CB; // support old cb interface
  }): Promise<any> {
    // Deprecation warnings:
    for (const field of ["standby", "timeout", "no_post", "ignore_response"]) {
      if (opts[field] != null) {
        console.trace(`WARNING: passing '${field}' to query is deprecated`);
      }
    }
    if (opts.options != null && !is_array(opts.options)) {
      // should never happen...
      throw Error("options must be an array");
    }
    if (opts.changes) {
      const { cb } = opts;
      if (cb == null) {
        throw Error("for changefeed, must specify opts.cb");
      }
      let changefeed;
      try {
        changefeed = new NatsChangefeed({
          account_id: this.client.account_id,
          query: opts.query,
          options: opts.options,
        });
        // id for canceling this changefeed
        const id = uuid();
        const initval = await changefeed.connect();
        const query = {
          [Object.keys(opts.query)[0]]: initval,
        };
        this.changefeeds[id] = changefeed;
        cb(undefined, { query, id });
        changefeed.on("update", (change) => {
          cb(undefined, change);
        });
      } catch (err) {
        cb(`${err}`);
        return;
      }
    } else {
      try {
        const err = validate_client_query(opts.query, this.client.account_id);
        if (err) {
          throw Error(err);
        }
        const query = await this.client.nats_client.hub.db.userQuery({
          query: opts.query,
          options: opts.options,
        });

        if (query && !opts.options?.[0]?.["set"]) {
          // set thing isn't needed but doesn't hurt
          // deal with timestamp versus Date and JSON using our schema.
          for (const table in query) {
            client_db.processDates({ table, rows: query[table] });
          }
        }

        if (opts.cb == null) {
          return { query };
        } else {
          opts.cb(undefined, { query });
        }
      } catch (err) {
        if (opts.cb == null) {
          throw err;
        } else {
          opts.cb(err);
        }
      }
    }
  }

  // cancel a changefeed created above.  This is ONLY used
  // right now by the CRM code.
  public async cancel(id: string): Promise<void> {
    this.changefeeds[id]?.close();
    delete this.changefeeds[id];
  }
}
