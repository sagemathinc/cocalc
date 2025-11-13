/* Returns users of the sandbox that are idle. */

import getPool from "@cocalc/database/pool";
import { is_valid_uuid_string as isValid } from "@cocalc/util/misc";

export default async function idleSandboxUsers(
  project_id: string,
  idleTimeoutSeconds: number = 60 * 10
): Promise<string[]> {
  if (!isValid(project_id)) {
    throw Error("invalid project_id");
  }
  const pool = getPool("long"); // long cache makes sense here.
  const { rows } = await pool.query(
    `SELECT users, last_active, sandbox FROM projects WHERE project_id=$1`,
    [project_id]
  );
  if (rows.length == 0) {
    // no such project -- nothing to do
    return [];
  }
  if (!rows[0].sandbox) {
    // not a sandbox, so nothing to do
    return [];
  }
  const idleUsers: string[] = [];
  const { users, last_active } = rows[0];
  const now = Date.now();
  const cutoff = now - idleTimeoutSeconds * 1000;
  const addToLastActive: string[] = []; // these got added to sandbox but no activity being tracked yet, so we initialize it.
  for (const account_id in users ?? {}) {
    const active = new Date(last_active?.[account_id] ?? 0).valueOf();
    if (!active) {
      addToLastActive.push(account_id);
    } else if (active <= cutoff && users[account_id]?.["group"] != "owner") {
      idleUsers.push(account_id);
    }
  }

  if (addToLastActive.length > 0) {
    await updateLastActive(project_id, addToLastActive);
  }
  return idleUsers;
}

async function updateLastActive(
  project_id: string,
  users: string[]
): Promise<void> {
  const pool = getPool();
  const now = new Date();
  const X: any = {};
  for (const account_id of users) {
    X[account_id] = now;
  }
  await pool.query(
    `UPDATE projects SET last_active = COALESCE(last_active, '{}') || '${JSON.stringify(
      X
    )}' WHERE project_id=$1`,
    [project_id]
  );
}
