/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Functionality related to running cocalc in personal mode.
*/

import { PostgreSQL } from "../types";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { uuid } from "@cocalc/util/misc";

async function _get_personal_user(database: PostgreSQL): Promise<string> {
  // Get account_id of the one and only user, or if there is no user, create one and return its account_id.

  const result = await database.async_query({
    query:
      "SELECT account_id FROM accounts WHERE created is not NULL ORDER BY created LIMIT 1",
  });
  for (const row of result.rows) {
    return row.account_id;
  }
  // No results, so create THE account.
  const account_id = uuid();
  await database.async_query({
    query: "INSERT INTO accounts",
    values: {
      account_id,
      first_name: "Your",
      last_name: "Name",
      created: new Date(),
      groups: ["admin"],
    },
  });
  return account_id;
}

export const get_personal_user = reuseInFlight(_get_personal_user, {
  createKey: () => "",
});
