/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { is_array } from "@cocalc/util/misc";
import { validate_client_query } from "@cocalc/util/schema-validate";
import { CB } from "@cocalc/util/types/database";
import { ConatChangefeed } from "@cocalc/sync/table/changefeed-conat";
import { uuid } from "@cocalc/util/misc";

declare const $: any; // jQuery

export class QueryClient {
  private client: any;
  private changefeeds: { [id: string]: ConatChangefeed } = {};

  constructor(client: any) {
    this.client = client;
  }

  // This works like a normal async function when
  // opts.cb is NOT specified.  When opts.cb is specified,
  // it works like a cb and returns nothing.    For changefeeds
  // you MUST specify opts.cb, but can always optionally do so.
  query = async (opts: {
    query: object;
    options?: object[]; // if given must be an array of objects, e.g., [{limit:5}]
    changes?: boolean;
    timeout?: number; // ms
    cb?: CB; // support old cb interface
  }): Promise<any> => {
    const timeoutMs = opts.timeout ?? 15000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Query timed out after ${timeoutMs} ms`)),
        timeoutMs,
      );
    });

    try {
      // Deprecation warnings:
      for (const field of ["standby", "no_post", "ignore_response"]) {
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
          changefeed = new ConatChangefeed({
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
          const query = await Promise.race([
            this.client.conat_client.hub.db.userQuery({
              query: opts.query,
              options: opts.options,
              timeout: opts.timeout,
            }),
            timeoutPromise,
          ]);

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
    } finally {
      if (timer != null) {
        clearTimeout(timer);
      }
    }
  };

  // cancel a changefeed created above.  This is ONLY used
  // right now by the CRM code.
  cancel = async (id: string): Promise<void> => {
    this.changefeeds[id]?.close();
    delete this.changefeeds[id];
  };
}
