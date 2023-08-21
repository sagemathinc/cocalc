/*
Stop project with given pay as you go upgrade.
*/

import { setPayAsYouGoProjectQuotas } from "../api";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import track from "@cocalc/frontend/user-tracking";
import { redux } from "@cocalc/frontend/app-framework";

export default async function stopProject({
  project_id,
  quota,
  disable,
  setStatus,
}: {
  project_id: string;
  quota: ProjectQuota;
  disable?: boolean;
  setStatus: (string) => void;
}) {
  track("pay-as-you-go-upgrade", { action: "stop", quota, project_id });
  if (disable) {
    setStatus("Disabling pay as you go...");
    quota = { ...quota, enabled: 0 };
    await setPayAsYouGoProjectQuotas(project_id, quota);
  }
  const actions = redux.getActions("projects");
  setStatus("Stopping project...");
  await actions.stop_project(project_id);
}
