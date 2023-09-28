/*
Start a compute serrver, first confirming with a modal if necessary
that a user has available funds.
*/

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { isPurchaseAllowed } from "../api";
import track from "@cocalc/frontend/user-tracking";

// when checking user has sufficient credits to run compute server, require that
// they have enough for this many hours.
// Otherwise, it is way too easy to start compute server with upgrades,
// then have it just stop again an hour or less later, which is
// just annoying.
const MIN_HOURS = 6;
const MIN_COST = 2.5; // no matter what require at least this much credit.

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
  const { allowed, reason } = await isPurchaseAllowed(
    "compute-server",
    minBalance,
  );
  if (!allowed) {
    // Increasing balance or limits ...
    await webapp_client.purchases_client.quotaModal({
      service: "compute-server",
      reason,
      allowed,
      cost: minBalance,
      cost_per_hour,
    });
    {
      // Check again, since result of modal may not be sufficient.
      // This time if not allowed, will show an error.
      // Checking balance and limits...
      const { allowed, reason } = await isPurchaseAllowed(
        "compute-server",
        minBalance,
      );
      if (!allowed) {
        throw Error(reason);
      }
    }
  }
  track("compute-server", { action: "start", id, cost_per_hour });
}
