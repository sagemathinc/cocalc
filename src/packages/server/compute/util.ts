import { getPool } from "@cocalc/database";
import type { State } from "@cocalc/util/db-schema/compute-servers";

export async function setState(id: number, state: State) {
  const pool = getPool();
  await pool.query(
    "UPDATE compute_servers SET state=$1, state_changed=NOW() WHERE id=$2",
    [state, id],
  );
}

export async function setError(id: number, error: string) {
  const pool = getPool();
  await pool.query("UPDATE compute_servers SET error=$1 WHERE id=$2", [
    error,
    id,
  ]);
}
