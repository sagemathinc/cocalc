/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as message from "smc-util/message";
import { is_array } from "smc-util/misc2";
import { validate_client_query } from "smc-util/schema-validate";

declare const $: any; // jQuery

export class QueryClient {
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  private async call(message: object, timeout: number): Promise<any> {
    return await this.client.async_call({
      message,
      timeout,
      allow_post: false, // since that would happen via this.post_query
    });
  }

  // This works like a normal async function when
  // opts.cb is NOT specified.  When opts.cb is specified,
  // it works like a cb and returns nothing.  For changefeeds
  // you MUST specify opts.cb, but can always optionally do so.
  public async query(opts: {
    query: object;
    changes?: boolean;
    options?: object[]; // if given must be an array of objects, e.g., [{limit:5}]
    standby?: boolean; // if true and use HTTP post, then will use standby server (so must be read only)
    timeout?: number; // default: 30
    no_post?: boolean; // DEPRECATED -- didn't turn out to be worth it.
    ignore_response?: boolean; // if true, be slightly efficient by not waiting for any response or
    // error (just assume it worked; don't care about response)
    cb?: Function; // used for changefeed outputs if changes is true
  }): Promise<any> {
    if (opts.options != null && !is_array(opts.options)) {
      // should never happen...
      throw Error("options must be an array");
    }
    if (opts.changes && opts.cb == null) {
      throw Error("for changefeed, must specify opts.cb");
    }

    const err = validate_client_query(opts.query, this.client.account_id);
    if (err) {
      throw Error(err);
    }
    const mesg = message.query({
      query: opts.query,
      options: opts.options,
      changes: opts.changes,
      multi_response: !!opts.changes,
    });
    if (opts.timeout == null) {
      opts.timeout = 30;
    }
    if (mesg.multi_response) {
      if (opts.cb == null) {
        throw Error("changefeed requires cb callback");
      }
      this.client.call({
        allow_post: false,
        message: mesg,
        error_event: true,
        timeout: opts.timeout,
        cb: opts.cb,
      });
    } else {
      if (opts.cb != null) {
        try {
          const result = await this.call(mesg, opts.timeout);
          opts.cb(undefined, result);
        } catch (err) {
          opts.cb(err.message);
        }
      } else {
        return await this.call(mesg, opts.timeout);
      }
    }
  }

  public async cancel(id: string): Promise<void> {
    await this.call(message.query_cancel({ id }), 30);
  }
}
