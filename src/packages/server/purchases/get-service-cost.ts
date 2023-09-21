/*
Returns an object that describes the cost of a given service.
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import {
  getCost as getOpenaiCost,
  OpenaiCost,
} from "@cocalc/util/db-schema/openai";
import type { Service } from "@cocalc/util/db-schema/purchases";

// This complicated typing is so that this function returns
// a *number* for input 'credit' and various objects for
// 'project-upgrade', and 'openai-'....

interface ProjectUpgrade {
  cores: number;
  disk_quota: number;
  member_host: number;
  memory: number;
}

type ServiceCost<T extends Service> = T extends "credit" // if type is 'credit' return a number
  ? number
  : T extends "project-upgrade" // if type is 'project-upgrade' return ProjectUpgrade
  ? ProjectUpgrade
  : OpenaiCost; // otherwise return OpenaiCost object

export default async function getServiceCost<T extends Service>(
  service: T
): Promise<ServiceCost<T>> {
  if (service.startsWith("openai-")) {
    const { pay_as_you_go_openai_markup_percentage } =
      await getServerSettings();
    const model = service.slice(7);
    return getOpenaiCost(
      model as any,
      pay_as_you_go_openai_markup_percentage
    ) as any;
  } else if (service == "credit") {
    // returns the minimum allowed credit.
    const { pay_as_you_go_min_payment } = await getServerSettings();
    return pay_as_you_go_min_payment;
  } else if (service == "project-upgrade") {
    const { pay_as_you_go_price_project_upgrades } = await getServerSettings();
    return pay_as_you_go_price_project_upgrades;
  } else {
    throw Error(`${service} not fully implemented`);
  }
}
