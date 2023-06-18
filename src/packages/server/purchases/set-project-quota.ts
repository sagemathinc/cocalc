import {
  ProjectQuota,
  PROJECT_QUOTA_KEYS,
} from "@cocalc/util/db-schema/purchase-quotas";
import getPool from "@cocalc/database/pool";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

export default async function setProjectQuota({
  account_id,
  project_id,
  quota,
}: {
  account_id: string;
  project_id: string;
  quota: ProjectQuota;
}) {
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be a collaborator on the project");
  }

  // some sanity tests so we don't store weird crap in the database.
  // We store only the positive values in the quota.
  const quota1: ProjectQuota = {};
  for (const key in quota) {
    if (!PROJECT_QUOTA_KEYS.has(key)) {
      // this could only happen in really weird cases -- don't ignore
      throw Error(`invalid key ${key}`);
    }
    if (
      typeof quota[key] != "number" ||
      quota[key] <= 0 ||
      !isFinite(quota[key])
    ) {
      // just skip
      continue;
    }
    quota1[key] = quota[key];
  }

  const db = getPool();
  await db.query(
    `UPDATE projects SET pay_as_you_go_quotas = jsonb_set(COALESCE(pay_as_you_go_quotas, '{}'::jsonb), '{${account_id}}', $1::jsonb) WHERE project_id=$2`,
    [quota1, project_id]
  );
}
