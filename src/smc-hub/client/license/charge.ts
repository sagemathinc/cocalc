/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PostgreSQL } from "../../postgres/types";
import { PurchaseInfo } from "smc-webapp/site-licenses/purchase/util";

export async function charge_user_for_license(
  database: PostgreSQL,
  account_id: string,
  info: PurchaseInfo,
  dbg: (...args) => void
): Promise<void> {
  dbg("charging for a license... -- STUB");
  database = database;
  account_id = account_id;
  info = info;
}
