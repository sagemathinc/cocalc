/*
Returns an object that describes the cost of a given service.
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { getCost as getOpenaiCost } from "@cocalc/util/db-schema/openai";
import type { Service } from "@cocalc/util/db-schema/purchases";
import { EGRESS_COST_PER_GiB } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";

export default async function getServiceCost(service: Service) {
  if (service.startsWith("openai-")) {
    const { pay_as_you_go_openai_markup_percentage } =
      await getServerSettings();
    const model = service.slice(7);
    return getOpenaiCost(
      model as any,
      pay_as_you_go_openai_markup_percentage,
    ) as any;
  } else if (service == "credit") {
    // returns the minimum allowed credit.
    const { pay_as_you_go_min_payment } = await getServerSettings();
    return pay_as_you_go_min_payment;
  } else if (service == "project-upgrade") {
    const { pay_as_you_go_price_project_upgrades } = await getServerSettings();
    return pay_as_you_go_price_project_upgrades;
  } else if (service == "compute-server") {
    const { compute_servers_markup_percentage } = await getServerSettings();
    return compute_servers_markup_percentage;
  } else if (service == "compute-server-network-usage") {
    return EGRESS_COST_PER_GiB;
  } else {
    throw Error(`${service} not fully implemented`);
  }
}
