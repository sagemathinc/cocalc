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

  private doChangefeed = async (opts: {
    query: object;
    options?: object[];
    cb: CB;
  }): Promise<void> => {
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
      opts.cb(undefined, { query, id });
      changefeed.on("update", (change) => {
        opts.cb(undefined, change);
      });
    } catch (err) {
      opts.cb(`${err}`);
    }
  };

  private doQuery = async (opts: {
    query: object;
    options?: object[];
    timeout?: number;
  }): Promise<any> => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const queryPromise = this.client.conat_client.hub.db.userQuery({
        query: opts.query,
        options: opts.options,
        timeout: opts.timeout,
      });

      // Add client-side timeout if explicitly requested
      if (opts.timeout != null) {
        let timedOut = false;

        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true; // Set flag before rejecting
            reject(new Error(`Query timed out after ${opts.timeout} ms`));
          }, opts.timeout);
        });

        // Prevent unhandled rejection if timeout fires first
        queryPromise.catch((err) => {
          if (timedOut) {
            // Timeout already happened, this is an orphaned rejection - just log it
            console.warn("Query failed after client-side timeout:", err);
          }
          // If not timed out, error is handled by the race
        });

        return await Promise.race([queryPromise, timeoutPromise]);
      } else {
        return await queryPromise;
      }
    } finally {
      if (timer != null) {
        clearTimeout(timer);
      }
    }
  };

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
      await this.doChangefeed({
        query: opts.query,
        options: opts.options,
        cb,
      });
    } else {
      try {
        const err = validate_client_query(opts.query, this.client.account_id);
        if (err) {
          throw Error(err);
        }

        const query = await this.doQuery({
          query: opts.query,
          options: opts.options,
          timeout: opts.timeout,
        });

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
  };

  // cancel a changefeed created above.  This is ONLY used
  // right now by the CRM code.
  cancel = async (id: string): Promise<void> => {
    this.changefeeds[id]?.close();
    delete this.changefeeds[id];
  };
}
