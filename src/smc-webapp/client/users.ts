/* information about users */

import { aggregate } from "smc-util/aggregate";
import * as message from "smc-util/message";
import { callback2 } from "smc-util/async-utils";

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

  constructor(call: Function) {
    this.call = call;
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
