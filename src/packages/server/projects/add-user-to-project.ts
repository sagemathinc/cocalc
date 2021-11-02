import getPool from "@cocalc/database/pool";
import { jsonbSet } from "@cocalc/database/postgres/jsonb-utils";
import { is_valid_uuid_string as isValidUUID } from "@cocalc/util/misc";

interface Options {
  account_id: string;
  project_id: string;
  group?: string;
}

export default async function addUserToProject({
  account_id,
  project_id,
  group, // default is 'collaborator'
}: Options): Promise<void> {
  if (!isValidUUID(account_id) || !isValidUUID(project_id)) {
    throw Error("account_id and project_id must be UUID's");
  }
  const pool = getPool();
  if (!group) {
    group = "collaborator";
  }
  const { set, params } = jsonbSet({ users: { [account_id]: { group } } });

  await pool.query(
    `UPDATE projects SET ${set} WHERE project_id=$${params.length + 1}`,
    params.concat(project_id)
  );
}
