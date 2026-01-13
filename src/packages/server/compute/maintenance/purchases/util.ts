import getPool, { PoolClient } from "@cocalc/database/pool";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import { moneyToDbString, type MoneyValue } from "@cocalc/util/money";

export async function setPurchaseId({
  purchase_id,
  server_id,
  cost_per_hour,
  client,
}: {
  purchase_id: number | null;
  server_id: number;
  cost_per_hour: MoneyValue;
  client?: PoolClient;
}) {
  const costValue = purchase_id == null || cost_per_hour == null ? 0 : cost_per_hour;
  await (client ?? getPool()).query(
    "UPDATE compute_servers SET purchase_id=$1, cost_per_hour=$2 WHERE id=$3",
    [purchase_id, moneyToDbString(costValue), server_id],
  );
}

export async function getPurchase(id): Promise<Purchase> {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM purchases WHERE id=$1", [
    id,
  ]);
  if (rows.length == 0) throw Error(`no purchase with id ${id}`);
  return rows[0];
}
