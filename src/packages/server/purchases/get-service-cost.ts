/*
Returns an object that describes the cost of a given service.
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { DATA_TRANSFER_OUT_COST_PER_GiB } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import {
  getLLMCost,
  isCoreLanguageModel,
  isLanguageModelService,
  service2model,
} from "@cocalc/util/db-schema/llm-utils";
import type { Service } from "@cocalc/util/db-schema/purchases";
import { unreachable } from "@cocalc/util/misc";

export default async function getServiceCost(service: Service) {
  if (isLanguageModelService(service)) {
    const model = service2model(service);
    if (isCoreLanguageModel(model)) {
      const { pay_as_you_go_openai_markup_percentage } =
        await getServerSettings();
      return getLLMCost(model, pay_as_you_go_openai_markup_percentage) as any;
    } else {
      return {
        prompt_tokens: 0,
        completion_tokens: 0,
      };
    }
  }

  switch (service) {
    case "credit":
      // returns the minimum allowed credit.
      const { pay_as_you_go_min_payment } = await getServerSettings();
      return pay_as_you_go_min_payment;

    case "compute-server":
    case "compute-server-storage":
      const { compute_servers_markup_percentage } = await getServerSettings();
      return compute_servers_markup_percentage;

    case "compute-server-network-usage":
      return DATA_TRANSFER_OUT_COST_PER_GiB;

    case "refund":
    case "student-pay":
    case "voucher":
      throw new Error("No cost for these services");

    default:
      // no fallback, we want an error if there is another type of service
      unreachable(service);
      throw new Error(`${service} not fully implemented`);
  }
}
