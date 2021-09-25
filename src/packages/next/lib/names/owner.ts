/* Get basic information about a user or organization
from the database.  This should be enough to render
a nice "homepage" for that user or organization.
*/

import getPool from "@cocalc/util-node/database";

// Throws an exception if there is no account or org with this name.
// TODO: take into account redirects for when name is changed.

export default async function getOwner(
  owner: string
): Promise<{ type: "account" | "organization"; owner_id: string }> {
  const pool = getPool();
  // Is it an account?
  let result = await pool.query(
    "SELECT account_id FROM accounts WHERE LOWER(name)=$1",
    [owner.toLowerCase()]
  );
  if (result.rows.length > 0) {
    return { type: "account", owner_id: result.rows[0].account_id };
  }
  // Is it an organization?
  result = await pool.query(
    "SELECT title, description, organization_id FROM organizations WHERE LOWER(name)=$1",
    [owner.toLowerCase()]
  );
  if (result.rows.length > 0) {
    return { type: "organization", owner_id: result.rows[0].organization_id };
  }
  throw Error(`no account or organization '${owner}'`);
}
