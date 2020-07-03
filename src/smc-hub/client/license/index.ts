/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Handle purchasing a licenses by customers. This is the server side of
   smc-webapp/site-licenses/purchase/

What this does:

- stores the request object in a table in the database
- if the request is for a quote, sends an email
- if the request is to make a purchase, makes that purchase and creates the license
*/

import { PurchaseInfo } from "smc-webapp/site-licenses/purchase/util";

// Does what should be done, and returns a string that should be passed to the user
// summarizing what happening.
export async function purchase_license(
  account_id: string,
  info: PurchaseInfo,
  dbg: (...args) => void
): Promise<string> {
  dbg(`got info=${JSON.stringify(info)} for ${account_id}`);
  return "stub";
}
