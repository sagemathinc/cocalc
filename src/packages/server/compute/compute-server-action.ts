import type { Action } from "@cocalc/util/db-schema/compute-servers";
import { getPool } from "@cocalc/database";
import { start, stop, suspend, resume } from "./control";

interface Options {
  id: number;
  account_id: string;
  action: Action;
}

export default async function computeServerAction({
  id,
  account_id,
  action,
}: Options): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS count FROM compute_servers WHERE id=$1 AND account_id=$2",
    [id, account_id],
  );
  if (rows[0].count != 1) {
    throw Error("must be the owner of the compute server");
  }

  switch (action) {
    case "start":
      return await start({ id, account_id });
    case "stop":
      return await stop({ id, account_id });
    case "suspend":
      return await suspend({ id, account_id });
    case "resume":
      return await resume({ id, account_id });
    default:
      throw Error(`action '${action}' not implemented`);
  }
}
