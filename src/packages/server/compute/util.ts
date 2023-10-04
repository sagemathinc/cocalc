import { getPool } from "@cocalc/database";
import type { State, Data } from "@cocalc/util/db-schema/compute-servers";
import { isEqual } from "lodash";

// set the state. We ONLY make a change to the database updating state_changed
// if the state actually changes, to avoid a lot of not necessary noise.
export async function setState(id: number, state: State) {
  const pool = getPool();
  await pool.query(
    "UPDATE compute_servers SET state=$1, state_changed=NOW(), last_edited=NOW() WHERE id=$2 AND state != $1",
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

export async function setData({
  cloud,
  id,
  data,
}: {
  id: number;
  cloud: "lambda-cloud" | "google-cloud";
  data: Partial<Data>;
}) {
  const pool = getPool();
  await pool.query(
    `UPDATE compute_servers SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb, last_edited=NOW()  WHERE id=$2`,
    [JSON.stringify({ ...data, cloud }), id],
  );
}

// merges in configuration

export async function setConfiguration(id: number, newConfiguration: object) {
  const pool = getPool();
  await pool.query(
    `UPDATE compute_servers SET configuration = COALESCE(configuration, '{}'::jsonb) || $1::jsonb, last_edited=NOW() WHERE id=$2`,
    [JSON.stringify(newConfiguration), id],
  );
}

export function changedKeys(currentConfiguration, newConfiguration) {
  const keys = new Set(
    Object.keys(currentConfiguration).concat(Object.keys(newConfiguration)),
  );
  const changed = new Set<string>();
  for (const key of keys) {
    if (!isEqual(currentConfiguration[key], newConfiguration[key])) {
      changed.add(key);
    }
  }
  return changed;
}
