/*
Functions for working with project quotas.
*/

import { getServerSettings } from "@cocalc/server/settings/server-settings";

export async function getMaxQuotas() {
  const { pay_as_you_go_max_project_upgrades } = await getServerSettings();
  return pay_as_you_go_max_project_upgrades;
}
