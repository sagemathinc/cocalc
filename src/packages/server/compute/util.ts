import { getPool } from "@cocalc/database";
import type { State, Data } from "@cocalc/util/db-schema/compute-servers";
import { isEqual } from "lodash";
import eventLog from "./event-log";
import { cost } from "./control";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:util");

// set the state. We ONLY make a change to the database updating state_changed
// if the state actually changes, to avoid a lot of not necessary noise.
export async function setState(id: number, state: State) {
  const pool = getPool();
  const { rows } = await pool.query(
    "UPDATE compute_servers SET state=$1, state_changed=NOW(), last_edited=NOW() WHERE id=$2 AND (state is null or state != $1) RETURNING account_id",
    [state, id],
  );
  if (rows.length > 0) {
    try {
      await stateChangeSideEffects({
        id,
        state,
        account_id: rows[0].account_id,
      });
    } catch (err) {
      logger.debug(
        "WARNING -- errors when doing state change side effects",
        err,
      );
    }
  }
}

async function stateChangeSideEffects({ id, state, account_id }) {
  const pool = getPool();
  // ensure cost_per_hour field in database is updated immediately to reflect state;
  // otherwise, it is disconcerting to users.  NOTE: In reality, the actual cost we're
  // charging doesn't update until the maintenance task runs a few seconds later.
  await cost({ id, account_id, state });

  eventLog({
    server: { id },
    event: { action: "state", state },
  });

  if (state != "running") {
    // we also clear the "detailed_state", which is detailed information
    // about a *running* compute
    // server, and is confusing to see otherwise.
    await pool.query(
      "UPDATE compute_servers SET detailed_state='{}' WHERE id=$1",
      [id],
    );
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

// merges the object 'data' into the current data in the database
// (i.e., doesn't delete keys not mentioned in 'data')

export async function setData({
  cloud,
  id,
  data,
}: {
  id: number;
  cloud: "lambda-cloud" | "google-cloud" | "hyperstack";
  data: Partial<Data> | { [key: string]: null };
}) {
  const pool = getPool();
  await pool.query(
    `UPDATE compute_servers SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb, last_edited=NOW()  WHERE id=$2`,
    [JSON.stringify({ ...data, cloud }), id],
  );
}

export async function getData({
  id,
}: {
  id: number;
}): Promise<Data | undefined> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT data FROM compute_servers WHERE id=$1",
    [id],
  );
  if (rows.length == 0) {
    throw Error(`no server with id=${id}`);
  }
  return rows[0].data;
}

export async function clearData({ id }: { id: number }) {
  const pool = getPool();
  await pool.query(
    `UPDATE compute_servers SET data = NULL, last_edited=NOW()  WHERE id=$1`,
    [id],
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

const HIDE_FROM_LOG = new Set(["authToken"]);

async function logConfigurationChange({ id, configuration, newConfiguration }) {
  const changes: { [param: string]: { from: any; to: any } } = {};
  for (const key in newConfiguration) {
    if (HIDE_FROM_LOG.has(key)) {
      changes[key] = {
        from: configuration[key] ? "(hidden)" : "",
        to: newConfiguration[key] ? "(hidden)" : "",
      };
    } else {
      changes[key] = { from: configuration[key], to: newConfiguration[key] };
    }
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
