import getPool from "@cocalc/database/pool";

const MAX_NAME_LENGTH = 32;
const MAX_STATE_LENGTH = 128;
const MAX_EXTRA_LENGTH = 1024;

interface Options {
  project_id: string;
  id: number;
  name: string;
  state?: string;
  extra?: string;
  timeout?: number;
  progress?: number;
}

export default async function setDetailedState({
  project_id,
  id,
  name,
  state,
  extra,
  timeout,
  progress,
}: Options) {
  const pool = getPool();
  if (name == "state") {
    // special case to set the overall compute server state
    await pool.query(
      "UPDATE compute_servers SET state=$1, state_changed=NOW(), last_edited=NOW() WHERE  (state is null or state != $1) AND id=$2 AND project_id=$3",
      [state, id, project_id],
    );
    return;
  }
  if (!name || typeof name != "string") {
    throw Error("name must be specified");
  }
  if (name.length >= MAX_NAME_LENGTH) {
    throw Error(`name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  if (state && (typeof state != "string" || state.length >= MAX_STATE_LENGTH)) {
    throw Error(`name must be at most ${MAX_STATE_LENGTH} characters`);
  }
  if (extra && (typeof extra != "string" || extra.length >= MAX_EXTRA_LENGTH)) {
    throw Error(`name must be at most ${MAX_EXTRA_LENGTH} characters`);
  }
  if (timeout && (typeof timeout != "number" || timeout < 0)) {
    throw Error("if given, timeout must be a nonnegative number (of seconds)");
  }
  if (
    progress &&
    (typeof progress != "number" || progress < 0 || progress > 100)
  ) {
    throw Error("if given, progress must be a number between 0 and 100");
  }
  const args = [project_id, id];
  let query;
  if (!state) {
    // delete it
    query = "detailed_state = detailed_state - $3";
    args.push(name);
  } else {
    // set it
    query =
      "detailed_state = COALESCE(detailed_state, '{}'::jsonb) || $3::jsonb";
    args.push(
      JSON.stringify({
        [name]: {
          state,
          extra,
          time: Date.now(),
          expire: timeout ? Date.now() + 1000 * timeout : undefined,
          progress,
        },
      }),
    );
  }
  const { rowCount } = await pool.query(
    `UPDATE compute_servers SET ${query}, last_edited=NOW() WHERE project_id=$1 AND id=$2`,
    args,
  );
  if (rowCount == 0) {
    throw Error("invalid api_key, project_id or compute server id");
  }
}

export async function getDetailedState({ project_id, id, name }) {
  const pool = getPool();
  if (!name) {
    const { rows } = await pool.query(
      "SELECT detailed_state FROM compute_servers WHERE id=$1 AND project_id=$2",
      [id, project_id],
    );
    return rows[0]?.detailed_state;
  } else {
    const { rows } = await pool.query(
      "SELECT jsonb_extract_path(detailed_state, $3) as data FROM compute_servers WHERE id=$1 AND project_id=$2",
      [id, project_id, name],
    );
    return rows[0]?.data;
  }
}
