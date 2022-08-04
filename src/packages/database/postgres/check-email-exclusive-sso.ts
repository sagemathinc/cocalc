/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PostgreSQL } from "./types";
import getStrategies from "@cocalc/server/auth/sso/get-strategies";
import { checkRequiredSSO } from "@cocalc/server/auth/sso/check-required-sso";

export async function checkEmailExclusiveSSO(
  db: PostgreSQL,
  account_id: string,
  cb: (err: Error | null, result?: boolean) => void
): Promise<void> {
  try {
    const emailQuery = await db.async_query({
      query: "SELECT email_address FROM accounts",
      where: { "account_id = $": account_id },
    });
    const email = emailQuery.rows[0].email_address;
    if (email === null) {
      cb(null, false);
      return;
    }
    const strategies = await getStrategies();
    const strategy = checkRequiredSSO({ strategies, email });
    if (strategy != null) {
      cb(null, true);
      return;
    }
  } catch (err) {
    cb(err);
  }
  cb(null, false);
}
