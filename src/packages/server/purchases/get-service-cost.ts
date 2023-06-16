/*
Returns an object that describes the cost of a given service.
*/

import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { getCost as getOpenaiCost } from "@cocalc/util/db-schema/openai";

export default async function getServiceCost(service): Promise<object> {
  if (service.startsWith("openai-")) {
    const { pay_as_you_go_openai_markup_percentage } =
      await getServerSettings();
    const model = service.slice(7);
    return getOpenaiCost(model, pay_as_you_go_openai_markup_percentage);
  } else if (service == "credit") {
    // returns the minimum allowed credit.
    const { pay_as_you_go_min_payment } = await getServerSettings();
    return pay_as_you_go_min_payment ?? 2.5;
  } else {
    throw Error(`${service} not fully implemented`);
  }
}
