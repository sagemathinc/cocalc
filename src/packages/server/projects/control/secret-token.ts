import { secureRandomString } from "@cocalc/backend/misc";
import getPool from "@cocalc/database/pool";

const SECRET_TOKEN_LENGTH = 32;

export async function getProjectSecretToken(project_id): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select secret_token from projects where project_id=$1",
    [project_id],
  );
  if (rows.length == 0) {
    throw Error(`no project ${project_id}`);
  }
  if (!rows[0].secret_token) {
    const secret_token = await secureRandomString(SECRET_TOKEN_LENGTH);
    await pool.query(
      "UPDATE projects SET secret_token=$1 where project_id=$2",
      [secret_token, project_id],
    );
    return secret_token;
  }
  return rows[0]?.secret_token;
}

export async function deleteProjectSecretToken(
  project_id,
): Promise<undefined> {
  const pool = getPool();
  await pool.query(
    "UPDATE projects SET secret_token=NULL WHERE project_id=$1",
    [project_id],
  );
}
