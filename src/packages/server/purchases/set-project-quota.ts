import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";

export default async function setProjectQuota({
  account_id,
  project_id,
  quota,
}: {
  account_id: string;
  project_id: string;
  quota: ProjectQuota;
}) {
  void account_id;
  void project_id;
  void quota;
  throw Error("Project pay-as-you-go upgrades are no longer supported.");
}
