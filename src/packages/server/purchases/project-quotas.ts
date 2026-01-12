/*
Functions for working with project quotas (legacy PAYG project upgrades).
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import { getPricePerHour as getPricePerHour0 } from "@cocalc/util/purchases/project-quotas";

export async function getMaxQuotas() {
  const { pay_as_you_go_max_project_upgrades } = await getServerSettings();
  return pay_as_you_go_max_project_upgrades;
}

export async function getPricePerHour(quota: ProjectQuota): Promise<number> {
  return getPricePerHour0(quota, await getPrices());
}

export async function getPrices() {
  const { pay_as_you_go_price_project_upgrades } = await getServerSettings();
  return pay_as_you_go_price_project_upgrades;
}
