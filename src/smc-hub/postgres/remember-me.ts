/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Getting, setting, etc. of remember_me cookies should go here.

OF course, not everything is rewritten yet...
*/

import { PostgreSQL } from "./types";
const { one_result } = require("../postgres-base");
import { callback } from "awaiting";
import { reuseInFlight } from "async-await-utils/hof";

async function _get_remember_me(
  db: PostgreSQL,
  hash: string,
  cache: boolean
): Promise<object | undefined> {
  // returned object is the signed_in_message

  function f(cb: Function): void {
    db._query({
      cache,
      query: "SELECT value, expire FROM remember_me",
      where: {
        "hash = $::TEXT": hash.slice(0, 127),
      },
      retry_until_success: { max_time: 60000, start_delay: 10000 }, // since we want this to be (more) robust to database connection failures.
      cb: one_result("value", cb),
    });
  }

  return await callback(f);
}

export const get_remember_me = reuseInFlight(_get_remember_me, {
  createKey: function (args) {
    return args[1] + args[2];
  },
});
