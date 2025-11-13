/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { getQuotaSiteSettings } from "@cocalc/database/postgres/site-license/quota-site-settings";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import { quota, Quota } from "@cocalc/util/upgrades/quota";
import { closePayAsYouGoPurchases } from "@cocalc/server/purchases/project-quotas";

const logger = getLogger("projects:control:pay-as-you-go");

const PAY_AS_YOU_GO_THRESH_MS = 60 * 1000;

export async function handlePayAsYouGoQuotas(
  project_id: string,
): Promise<Quota | null> {
  logger.debug("handlePayAsYouGoQuotas: project_id=", project_id);
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT pay_as_you_go_quotas, settings FROM projects WHERE project_id=$1",
    [project_id],
  );
  if (rows.length == 0) {
    logger.debug("handlePayAsYouGoQuotas: no such project");
    return null;
  }
  // The project exists and either we will NOT be using pay as you go,
  // or we will but with a new purchase.  In either case, we should end
  // an existing purchases.  This usually is a no-op, but when *restarting*
  // a project with a pay as you go purchase applied, it can sometimes
  // be necessary, especially in kucalc.
  await closePayAsYouGoPurchases(project_id);

  const { settings, pay_as_you_go_quotas: quotas } = rows[0];
  if (quotas == null) {
    logger.debug("handlePayAsYouGoQuotas: no pay as you go quotas set");
    return null;
  }

  const choice = getNearestChoice(quotas);
  if (choice == null || !choice.account_id || !choice.quota?.cost) {
    logger.debug("handlePayAsYouGoQuotas: no quota enabled");
    return null;
  }

  // Can the user actually create this purchase for at least 1 hour?
  // If so, we do it.  Note: this already got checked on the frontend
  // so this should only fail on the backend in rare cases (e.g., abuse),
  // so no need to have an error message the user sees here.
  const cost_per_hour = choice.quota.cost;
  const { allowed, reason } = await isPurchaseAllowed({
    account_id: choice.account_id,
    service: "project-upgrade",
    cost: cost_per_hour,
  });
  if (!allowed) {
    logger.debug("handlePayAsYouGoQuotas: purchase not allowed", reason);
    return null;
  }

  const site_settings = await getQuotaSiteSettings();

  // Create the purchase.
  //
  //
  // As explained in setProjectQuota, we can trust choice.quota.cost.
  try {
    const start = Date.now();
    choice.quota.start = start; // useful for some purposes here
    const purchase_id = await createPurchase({
      client: null,
      account_id: choice.account_id,
      project_id,
      service: "project-upgrade",
      period_start: new Date(start),
      cost_per_hour,
      description: {
        type: "project-upgrade",
        start,
        project_id,
        quota: choice.quota,
      },
    });
    logger.debug(
      "handlePayAsYouGoQuotas: success -- created purchase with id",
      purchase_id,
    );
    return quota(settings, {}, {}, site_settings, { ...choice, purchase_id });
  } catch (err) {
    // failed -- maybe could happen despite check above (?), but should
    // be VERY rare
    // We reset the run quota.
    logger.error(
      "handlePayAsYouGoQuotas: non-fatal error creating purchase -- will run without pay-as-you-go-quota",
      err,
    );
    return null;
  }
}

function getNearestChoice(quotas) {
  let choice: null | { quota: any; account_id: string } = null;
  const now = Date.now();
  for (const account_id in quotas) {
    const quota = quotas[account_id];
    if (Math.abs(quota.enabled - now) <= PAY_AS_YOU_GO_THRESH_MS) {
      if (choice == null) {
        choice = { quota, account_id };
      } else if (
        Math.abs(quota.enabled - now) < Math.abs(choice.quota.enabled - now)
      ) {
        choice.quota = quota;
        choice.account_id = account_id;
      }
    }
  }
  return choice;
}
