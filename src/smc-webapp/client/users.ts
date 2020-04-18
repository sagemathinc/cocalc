/* information about users */

import { aggregate } from "smc-util/aggregate";
import * as message from "smc-util/message";
import { callback2 } from "smc-util/async-utils";
import { AsyncCall } from "./client";

import { User } from "../frame-editors/generic/client";

const get_username = aggregate({ omit: ["call"] }, function (opts: {
  account_id: string;
  call: Function;
  aggregate: number;
  cb: Function;
}) {
  opts.call({
    message: message.get_usernames({ account_ids: [opts.account_id] }),
    error_event: true,
    cb(err, resp) {
      if (err) {
        opts.cb(err);
      } else {
        opts.cb(undefined, resp.usernames);
      }
    },
  });
});

export class UsersClient {
  private call: Function;
  private async_call: AsyncCall;

  constructor(call: Function, async_call: AsyncCall) {
    this.call = call;
    this.async_call = async_call;
  }

  public async user_search(opts: {
    query: string;
    limit?: number;
    active?: string; // if given, would restrict to users active this recently
    admin?: boolean; // admins can do an admin version of the query, which also does substring searches on email address (not just name)
  }): Promise<User[]> {
    if (opts.limit == null) opts.limit = 20;
    if (opts.active == null) opts.active = "";

    const { results } = await this.async_call({
      message: message.user_search({
        query: opts.query,
        limit: opts.limit,
        admin: opts.admin,
        active: opts.active,
      }),
    });
    return results;
  }

  // Gets username with given account_id.   The aggregate makes it so
  // this never calls to the backend more than once at a time (per minute)
  // for a given account_id.
  public async get_username(
    account_id: string
  ): Promise<{ first_name: string | null; last_name: string | null }> {
    const v = await callback2(get_username, {
      call: this.call,
      aggregate: Math.floor(new Date().valueOf() / 60000),
      account_id,
    });
    const u = v[account_id];
    if (u == null || u.first_name == undefined || u.last_name == undefined) {
      throw Error("no user with account_id ${account_id}");
    }
    return u;
  }
}
