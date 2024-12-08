/*
Start a compute server, first confirming with a modal if necessary
that a user has available funds.
*/

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { isPurchaseAllowed } from "../api";
import track from "@cocalc/frontend/user-tracking";

// when checking user has sufficient credits to run compute server, require that
// they have enough for this many hours.
const MIN_HOURS = 0.25;
const MIN_COST = 1; // no matter what, require at least this much credit.

export default async function confirmStartComputeServer({
  id,
  cost_per_hour,
}: {
  // id of the compute server
  id: number;
  // cost per hour to run it
  cost_per_hour: number;
}) {
  const minBalance = Math.max(cost_per_hour * MIN_HOURS, MIN_COST);

  // Checking balance and limits...
  for (const service of ["compute-server", "compute-server-network-usage"]) {
    const cost = service == "compute-server" ? minBalance : 1;
    const { allowed, reason } = await isPurchaseAllowed(service as any, cost);
    if (!allowed) {
      // Increasing balance or limits ...
      await webapp_client.purchases_client.quotaModal({
        service: service as any,
        reason,
        allowed,
        cost,
        cost_per_hour,
      });
      {
        // Check again, since result of modal may not be sufficient.
        // This time if not allowed, will show an error.
        // Checking balance and limits...
        const { allowed, reason } = await isPurchaseAllowed(
          "compute-server",
          cost,
        );
        if (!allowed) {
          throw Error(reason);
        }
      }
    }
  }
  track("compute-server", { action: "start", id, cost_per_hour });
}
