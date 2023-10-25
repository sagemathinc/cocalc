import getPool from "@cocalc/database/pool";

const MAX_NAME_LENGTH = 32;
const MAX_VALUE_LENGTH = 1024;

interface Options {
  project_id: string;
  id: number;
  name: string;
  value?: string;
}

export default async function setComponentState({
  project_id,
  id,
  name,
  value,
}: Options) {
  const pool = getPool();
  if (name == "state") {
    // special case to set the overall compute server state
    await pool.query(
      "UPDATE compute_servers SET state=$1, state_changed=NOW(), last_edited=NOW() WHERE id=$2 AND state != $1 AND project_id=$3",
      [value, id, project_id],
    );
    return;
  }
  if (!name) {
    throw Error("name must be specified");
  }
  if (name.length >= MAX_NAME_LENGTH) {
    throw Error(`name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  if (value && value.length >= MAX_VALUE_LENGTH) {
    throw Error(`name must be at most ${MAX_VALUE_LENGTH} characters`);
  }
  const args = [project_id, id];
  let query;
  if (!value) {
    // delete it
    query = "detailed_state = detailed_state - $3";
    args.push(name);
  } else {
    // set it
    query =
      "detailed_state = COALESCE(detailed_state, '{}'::jsonb) || $3::jsonb";
    args.push(JSON.stringify({ [name]: { value, time: Date.now() } }));
  }
  const { rowCount } = await pool.query(
    `UPDATE compute_servers SET ${query}, last_edited=NOW() WHERE project_id=$1 AND id=$2`,
    args,
  );
  if (rowCount == 0) {
    throw Error("invalid api_key, project_id or compute server id");
  }
}
