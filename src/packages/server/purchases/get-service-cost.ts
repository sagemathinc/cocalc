/*
Returns an object that describes the cost of a given service.
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import type { Service } from "@cocalc/util/db-schema/purchases";
import { unreachable } from "@cocalc/util/misc";

export default async function getServiceCost(service: Service) {
  switch (service) {
    case "auto-credit":
    case "credit":
      // returns the minimum allowed credit.
      const { pay_as_you_go_min_payment } = await getServerSettings();
      return pay_as_you_go_min_payment;

    case "membership":
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
