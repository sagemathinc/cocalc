/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { dict } from "@cocalc/util/misc";
import type { PostgreSQL } from "./types";

export interface GetCouponHistoryOptions {
  account_id: string;
}

export async function getCouponHistory(
  db: PostgreSQL,
  opts: GetCouponHistoryOptions,
): Promise<any> {
  const { rows } = await db.async_query({
    query: "SELECT coupon_history FROM accounts",
    where: { "account_id = $::UUID": opts.account_id },
  });

  if (!rows || rows.length === 0) {
    return undefined;
  }

  const couponHistory = rows[0].coupon_history;
  // SQL returns null, but we want undefined (matching one_result behavior)
  return couponHistory ?? undefined;
}

export interface UpdateCouponHistoryOptions {
  account_id: string;
  coupon_history: any;
}

export async function updateCouponHistory(
  db: PostgreSQL,
  opts: UpdateCouponHistoryOptions,
): Promise<void> {
  await db.async_query({
    query: "UPDATE accounts",
    set: { "coupon_history::JSONB": opts.coupon_history },
    where: { "account_id = $::UUID": opts.account_id },
  });
}

export interface AccountIdsToUsernamesOptions {
  account_ids: string[];
}

export interface UserName {
  first_name: string | null | undefined;
  last_name: string | null | undefined;
}

export type AccountIdsToUsernamesResult =
  | Record<string, UserName>
  | Array<never>;

export async function accountIdsToUsernames(
  db: PostgreSQL,
  opts: AccountIdsToUsernamesOptions,
): Promise<AccountIdsToUsernamesResult> {
  // Easy special case -- don't waste time on a db query
  if (opts.account_ids.length === 0) {
    return [];
  }

  const { rows } = await db.async_query({
    query: "SELECT account_id, first_name, last_name FROM accounts",
    where: { "account_id = ANY($::UUID[])": opts.account_ids },
  });

  // Create dictionary mapping account_id to {first_name, last_name}
  const result: Record<string, UserName> = dict(
    rows.map((r) => [
      r.account_id,
      { first_name: r.first_name, last_name: r.last_name },
    ]),
  );

  // Fill in unknown users (should never be hit...)
  for (const id of opts.account_ids) {
    if (result[id] == null) {
      result[id] = { first_name: undefined, last_name: undefined };
    }
  }

  return result;
}
