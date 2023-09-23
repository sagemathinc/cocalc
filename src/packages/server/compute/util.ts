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

// merges the object newData into the current data in the database
// (i.e., doesn't delete keys not mentioned in newData)

export async function setData(id: number, newData: object) {
  const pool = getPool();
  await pool.query(
    `UPDATE compute_servers SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb WHERE id=$2`,
    [JSON.stringify(newData), id],
  );
}

// merges in configuration

export async function setConfiguration(id: number, newConfiguration: object) {
  const pool = getPool();
  await pool.query(
    `UPDATE compute_servers SET configuration = COALESCE(configuration, '{}'::jsonb) || $1::jsonb WHERE id=$2`,
    [JSON.stringify(newConfiguration), id],
  );
}
