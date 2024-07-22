/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PostgreSQL } from "@cocalc/database/postgres/types";
import getStrategies from "@cocalc/database/settings/get-sso-strategies";
import { checkRequiredSSO } from "@cocalc/server/auth/sso/check-required-sso";

export async function checkEmailExclusiveSSO(
  db: PostgreSQL,
  account_id: string,
  new_email_address: string,
  cb: (err: Error | null, result?: boolean) => void,
): Promise<void> {
  try {
    const strategies = await getStrategies();

    // user's cannot change their email address to one that's covered by an exclusive strategy
    if (checkRequiredSSO({ strategies, email: new_email_address }) != null) {
      cb(null, true);
      return;
    }

    // user's current email: not allowed to modify it if covered by an exclusive strategy
    const emailQuery = await db.async_query({
      query: "SELECT email_address FROM accounts",
      where: { "account_id = $": account_id },
    });
    const email = emailQuery.rows[0].email_address;
    if (email != null) {
      const strategy = checkRequiredSSO({ strategies, email });
      if (strategy != null) {
        cb(null, true);
        return;
      }
    }
  } catch (err) {
    cb(err);
    return;
  }
  cb(null, false);
}
