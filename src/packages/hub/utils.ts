/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { callback2 } from "@cocalc/util/async-utils";
import type { PostgreSQL } from "@cocalc/database/postgres/types";
import type { PassportStrategyDB } from "./auth";

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
