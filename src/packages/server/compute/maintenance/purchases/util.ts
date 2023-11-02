import getPool, { PoolClient } from "@cocalc/database/pool";

export async function setPurchaseId({
  purchase_id,
  server_id,
  cost_per_hour,
  client,
}: {
  purchase_id: number | null;
  server_id: number;
  cost_per_hour: number;
  client?: PoolClient;
}) {
  if (purchase_id == null) {
    cost_per_hour = 0;
  }
  await (client ?? getPool()).query(
    "UPDATE compute_servers SET purchase_id=$1, cost_per_hour=$2 WHERE id=$3",
    [purchase_id, cost_per_hour, server_id],
  );
}
