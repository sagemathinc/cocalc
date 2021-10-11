// Get the name of an owner, i.e., an account_id or organization_id.

import getPool from "@cocalc/backend/database";

// Returns "" if owner doesn't have a name set.
export default async function getName(owner_id: string): Promise<string> {
  const pool = getPool('medium');

  for (const type of ["account", "organization"]) {
    const result = await pool.query(
      `SELECT name FROM ${type}s WHERE ${type}_id=$1`,
      [owner_id]
    );
    if (result.rows.length > 0) {
      return result.rows[0].name;
    }
  }
  return "";
}
