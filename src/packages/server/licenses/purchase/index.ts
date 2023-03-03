/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Handle purchasing a licenses by customers. This is the server side of
   @cocalc/frontend/site-licenses/purchase/

What this does:

- stores the request object in a table in the database
- if the request is for a quote, sends an email
- if the request is to make a purchase, makes that purchase and creates the license
*/

import { db } from "@cocalc/database";
import getPool from "@cocalc/database/pool";
import { syncCustomer } from "@cocalc/database/postgres/stripe";
import { sanity_checks } from "@cocalc/util/licenses/purchase/sanity-checks";
import { chargeUser, setPurchaseMetadata } from "./charge";
import createLicense from "./create-license";
import { StripeClient } from "@cocalc/server/stripe/client";
import { delay } from "awaiting";
import { getLogger } from "@cocalc/backend/logger";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
const logger = getLogger("purchaseLicense");

// Does what should be done, and returns the license_id of the license that was created
// and has user added to as a manager.

// We don't allow a user to attempt a purchase more than once every THROTTLE_S seconds.
// This is just standard good practice, and avoids "double clicks" and probably some
// sort of attacks.  We did *once* have a known case of a double purchase even with
// this in place, but maybe it was more than 15 seconds, and maybe multiple servers got the
// request.
const THROTTLE_S = 15;
const last_attempt: { [account_id: string]: number } = {};

export default async function purchaseLicense(
  account_id: string,
  info: PurchaseInfo,
  noThrottle?: boolean
): Promise<string> {
  logger.debug("info=", info, ", account_id=", account_id);
  if (info.type == "vouchers") {
    throw Error("purchaseLicense can't be used to purchase vouchers");
  }

  if (!noThrottle) {
    const now = Date.now();
    if (now - (last_attempt[account_id] ?? 0) <= THROTTLE_S * 1000) {
      throw Error(
        "You must wait at least " +
          THROTTLE_S.toString() +
          " seconds between license purchases."
      );
    }
    last_attempt[account_id] = now;
  }

  logger.debug("running sanity checks...");
  await sanity_checks(getPool(), info);

  let purchase;
  if (info.cost != null) {
    logger.debug("charging user for license...");
    const stripe = new StripeClient({ account_id });
    purchase = await chargeUser(stripe, info);
  } else {
    logger.debug(
      "no cost set for license, so not charging (e.g., redeeming a voucher?)"
    );
    purchase = null;
  }

  logger.debug("creating the license...");
  const database = db();
  const license_id = await createLicense(database, account_id, info);

  if (purchase != null) {
    logger.debug("set metadata on purchase...");
    await setPurchaseMetadata(purchase, { license_id, account_id });
  }

  // We have to try a few times, since the metadata sometimes doesn't appear
  // when querying stripe for the customer, even after it was written in the
  // above line.  Also, this gives the credit card a first chance to work.
  // This is ONLY for subscriptions.
  if (info.subscription != "no") {
    let done = false;
    let delay_s = 1;
    for (let i = 0; i < 20; i++) {
      const customer = await syncCustomer({ account_id });
      const data = customer?.subscriptions?.data;
      if (data != null) {
        for (const sub of data) {
          if (
            sub.metadata?.license_id == license_id &&
            sub.status == "active"
          ) {
            // metadata is set and status is active -- yes
            done = true;
            break;
          }
        }
      }
      if (done) {
        logger.debug(
          "successfully verified metadata properly set and sub is active..."
        );
        break;
      } else {
        logger.debug(
          "trying again to verify metadata properly set and sub is active..."
        );
      }
      await delay(delay_s * 1000);
      delay_s *= 1.1;
    }
    // Sets the license expire date if the subscription is NOT
    // active at this point (e.g., due to credit card failure).
    await database.sync_site_license_subscriptions(account_id);
  }

  return license_id;
}
