/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Getting, setting, etc. of remember_me cookies should go here.

OF course, not everything is rewritten yet...
*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { accountWhere } from "./account-core";
import type { PostgreSQL } from "./types";

async function _get_remember_me(
  db: PostgreSQL,
  hash: string,
  cache?: boolean,
): Promise<string | undefined> {
  // returns undefined for now account or the account_id of user we just authenticated
  const { rows } = await db.async_query({
    cache: cache ?? true,
    query: "SELECT account_id, expire FROM remember_me",
    where: {
      // db-schema/auth defines the hash field as a "bpchar", hence do not cast to TEXT – otherwise this is a 100x slowdown
      "hash = $::CHAR(127)": hash.slice(0, 127),
    },
    retry_until_success: { max_time: 60000, start_delay: 10000 }, // since we want this to be (more) robust to database connection failures.
  });

  if (!rows || rows.length === 0) {
    return undefined;
  }
  if (rows.length > 1) {
    throw new Error("multiple remember_me rows returned");
  }

  const row = rows[0];
  if (!row?.account_id) {
    return undefined;
  }
  if (row.expire && new Date() >= row.expire) {
    return undefined;
  }
  return row.account_id;
}

export const get_remember_me = reuseInFlight(_get_remember_me, {
  createKey: function (args) {
    return args[1] + args[2];
  },
});

export interface GetRememberMeMessageOptions {
  hash: string;
  cache?: boolean;
}

export interface SignedInMessage {
  event: "signed_in";
  account_id: string;
}

export async function get_remember_me_message(
  db: PostgreSQL,
  opts: GetRememberMeMessageOptions,
): Promise<SignedInMessage | undefined> {
  const account_id = await get_remember_me(db, opts.hash, opts.cache ?? true);
  if (!account_id) {
    return undefined;
  }
  return { event: "signed_in", account_id };
}

export interface InvalidateAllRememberMeOptions {
  account_id?: string;
  email_address?: string;
}

export async function invalidate_all_remember_me(
  db: PostgreSQL,
  opts: InvalidateAllRememberMeOptions,
): Promise<void> {
  await db.async_query({
    query: "DELETE FROM remember_me",
    where: accountWhere(opts),
  });
}

export interface DeleteRememberMeOptions {
  hash: string;
}

export async function delete_remember_me(
  db: PostgreSQL,
  opts: DeleteRememberMeOptions,
): Promise<void> {
  await db.async_query({
    query: "DELETE FROM remember_me",
    where: { "hash = $::TEXT": opts.hash.slice(0, 127) },
  });
}
