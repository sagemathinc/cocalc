/*
Start project with given pay as you go upgrade.
*/

import { redux } from "@cocalc/frontend/app-framework";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import { getPricePerHour } from "@cocalc/util/purchases/project-quotas";
import {
  getPayAsYouGoPricesProjectQuotas,
  isPurchaseAllowed,
  setPayAsYouGoProjectQuotas,
} from "../api";

// when checking user has sufficient credits to run project with
// upgrade, require that they have enough for this many hours.
const MIN_HOURS = 1;

export default async function startProject({
  project_id,
  quota,
  setStatus,
}: {
  project_id: string;
  quota: ProjectQuota;
  setStatus?: (string) => void;
}) {
  setStatus?.("Computing cost...");
  const prices = await getPayAsYouGoPricesProjectQuotas();
  const cost = getPricePerHour(quota, prices);

  setStatus?.("Checking balance and limits...");
  const { allowed, reason } = await isPurchaseAllowed(
    "project-upgrade",
    cost * MIN_HOURS,
  );
  if (!allowed) {
    setStatus?.("Increasing balance or limits ...");
    await webapp_client.purchases_client.quotaModal({
      service: "project-upgrade",
      reason,
      allowed,
      cost: cost * MIN_HOURS,
    });
    {
      // Check again, since result of modal may not be sufficient.
      // This time if not allowed, will show an error.
      setStatus?.("Checking balance and limits...");
      const { allowed, reason } = await isPurchaseAllowed(
        "project-upgrade",
        cost * MIN_HOURS,
      );
      if (!allowed) {
        throw Error(reason);
      }
    }
  }

  quota = {
    ...quota,
    enabled: webapp_client.server_time().valueOf(),
    cost,
  };
  track("pay-as-you-go-upgrade", { action: "start", quota, project_id });

  setStatus?.("Saving quotas...");
  await setPayAsYouGoProjectQuotas(project_id, quota);
  const actions = redux.getActions("projects");

  setStatus?.("Stopping project...");
  await actions.stop_project(project_id);

  setStatus?.("Starting project...");
  const result = await actions.start_project(project_id, {
    disablePayAsYouGo: true,
  });

  actions.project_log(project_id, {
    event: "pay-as-you-go-upgrade",
    quota,
  });
  return result;
}
