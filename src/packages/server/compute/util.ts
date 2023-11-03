import { getPool } from "@cocalc/database";
import type { State, Data } from "@cocalc/util/db-schema/compute-servers";
import { isEqual } from "lodash";
import eventLog from "./event-log";

// set the state. We ONLY make a change to the database updating state_changed
// if the state actually changes, to avoid a lot of not necessary noise.
export async function setState(id: number, state: State) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    "UPDATE compute_servers SET state=$1, state_changed=NOW(), last_edited=NOW() WHERE id=$2 AND (state is null or state != $1)",
    [state, id],
  );

  if (rowCount > 0) {
    eventLog({
      server: { id },
      event: { action: "state", state },
    });
  }
}

export async function setError(id: number, error: string) {
  const pool = getPool();
  await pool.query("UPDATE compute_servers SET error=$1 WHERE id=$2", [
    error,
    id,
  ]);
  if (error?.trim()) {
    eventLog({
      server: { id },
      event: { action: "error", error },
    });
  }
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
export async function setConfiguration(id: number, newConfiguration0: object) {
  const newConfiguration = { ...newConfiguration0 }; // avoid mutating arg
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT configuration FROM compute_servers WHERE id=$1",
    [id],
  );
  if (rows.length == 0) {
    throw Error("no such server");
  }
  const { configuration } = rows[0];
  for (const key in newConfiguration) {
    if (isEqual(newConfiguration[key], configuration[key])) {
      delete newConfiguration[key];
    }
  }
  if (Object.keys(newConfiguration).length == 0) {
    // nothing to do
    return;
  }
  await pool.query(
    `UPDATE compute_servers SET configuration = COALESCE(configuration, '{}'::jsonb) || $1::jsonb, last_edited=NOW() WHERE id=$2`,
    [JSON.stringify(newConfiguration), id],
  );
  logConfigurationChange({ id, configuration, newConfiguration });
}

async function logConfigurationChange({ id, configuration, newConfiguration }) {
  const changes: { [param: string]: { from: any; to: any } } = {};
  for (const key in newConfiguration) {
    changes[key] = { from: configuration[key], to: newConfiguration[key] };
  }
  eventLog({
    server: { id },
    event: { action: "configuration", changes },
  });
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
