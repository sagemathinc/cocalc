import getPool from "@cocalc/database/pool";
import type { ComputeServerTemplate } from "@cocalc/util/db-schema/compute-servers";

export async function setTemplate({
  account_id,
  id,
  template,
}: {
  account_id: string;
  id: number;
  template: ComputeServerTemplate;
}) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    "UPDATE compute_servers SET template=$1 WHERE id=$2 AND account_id=$3",
    [template, id, account_id],
  );
  if (rowCount == 0) {
    throw Error(
      `invalid id (=${id}) or attempt to change compute server by a non-owner, which is not allowed.`,
    );
  }
}
