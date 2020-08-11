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

import { PostgreSQL } from "../../postgres/types";
import {
  PurchaseInfo,
  sanity_checks,
} from "smc-webapp/site-licenses/purchase/util";
import { charge_user_for_license, set_purchase_metadata } from "./charge";
import { create_license } from "./create-license";
import { StripeClient } from "../../stripe/client";

// Does what should be done, and returns the license_id of the license that was created
// and has user added to as a manager.

// We don't allow a user to attempt a purchase more than once every THROTTLE_S seconds.
// This is just standard good practice, and avoids "double clicks" and probably some
// sort of attacks...
const THROTTLE_S = 15;
const last_attempt: { [account_id: string]: number } = {};

export async function purchase_license(
  database: PostgreSQL,
  stripe: StripeClient,
  account_id: string,
  info: PurchaseInfo,
  dbg: (...args) => void
): Promise<string> {
  dbg(`purchase_license: got info=${JSON.stringify(info)} for ${account_id}`);

  const now = new Date().valueOf();
  if (now - (last_attempt[account_id] ?? 0) <= THROTTLE_S * 1000) {
    throw Error(
      "You must wait at least " +
        THROTTLE_S.toString() +
        " seconds between license purchases."
    );
  }
  last_attempt[account_id] = now;

  dbg("purchase_license: running sanity checks...");
  sanity_checks(info);

  dbg("purchase_license: charging user for license...");
  const purchase = await charge_user_for_license(stripe, info, (...args) =>
    dbg("charge_user_for_license", ...args)
  );

  dbg("purchase_license: creating the license...");
  const license_id = await create_license(
    database,
    account_id,
    info,
    (...args) => dbg("create_license", ...args)
  );

  dbg("purchase_license: set metadata on purchase...");
  set_purchase_metadata(stripe, purchase, { license_id, account_id });

  return license_id;
}
