/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PostgreSQL } from "./postgres/types";
import { AllSiteSettings } from "@cocalc/util/db-schema/types";
import { expire_time } from "@cocalc/util/misc";
import { callback2 } from "@cocalc/util/async-utils";
import { PassportStrategyDB } from "./auth";

export async function have_active_registration_tokens(
  db: PostgreSQL
): Promise<boolean> {
  const resp = await callback2(db._query, {
    query:
      "SELECT EXISTS(SELECT 1 FROM registration_tokens WHERE disabled IS NOT true) AS have_tokens",
    cache: true,
  });
  return resp.rows[0]?.have_tokens === true;
}

interface PassportConfig {
  strategy: string;
  conf: PassportStrategyDB;
}
export type PassportConfigs = PassportConfig[];

export async function get_passports(db: PostgreSQL): Promise<PassportConfigs> {
  return await callback2(db.get_all_passport_settings_cached);
}

// just to make this async friendly, that's all
export async function get_server_settings(
  db: PostgreSQL
): Promise<AllSiteSettings> {
  return await callback2(db.get_server_settings_cached);
}

// this converts what's in the pii_expired setting to a new Date in the future
export function pii_retention_to_future<T extends object>(
  pii_retention: number | false,
  data?: T & { expire?: Date }
): Date | undefined {
  if (!pii_retention) return;
  const future: Date = expire_time(pii_retention);
  if (data != null) {
    data.expire = future;
  }
  return future;
}

// use this to get the "expire" value for storing certain entries in the DB,
// which contain personally identifiable information.
// if data is set, it's expire field will be set. in any case, it returns the "Date"
// in the future.
export async function pii_expire<T extends object>(
  db: PostgreSQL,
  data?: T & { expire?: Date }
): Promise<Date | undefined> {
  const settings = await get_server_settings(db);
  return pii_retention_to_future<T>(settings.pii_retention, data);
}
