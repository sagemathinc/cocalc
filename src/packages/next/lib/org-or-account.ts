/* Get basic information about a user or organization
from the database.  This should be enough to render
a nice "homepage" for that user or organization.
*/

import getPool from "@cocalc/util-node/database";

interface AccountInfo {
  type: "account";
  name: string;
  first_name?: string;
  last_name?: string;
}

interface OrganizationInfo {
  type: "organization";
  name: string;
  title?: string;
  description?: string;
}

// Throws an exception if there is no account or org with this name.

export default async function getOrganizationOrAccountInfo(
  name: string
): Promise<OrganizationInfo | AccountInfo> {
  const pool = getPool();
  // Is it an account?
  let result = await pool.query(
    "SELECT first_name, last_name, account_id FROM accounts WHERE LOWER(name)=$1",
    [name.toLowerCase()]
  );
  if (result.rows.length > 0) {
    return { type: "account", name, ...result.rows[0] } as AccountInfo;
  }
  // Is it an organization?
  result = await pool.query(
    "SELECT title, description, organization_id FROM organizations WHERE LOWER(name)=$1",
    [name.toLowerCase()]
  );
  if (result.rows.length > 0) {
    return {
      type: "organization",
      name,
      ...result.rows[0],
    } as OrganizationInfo;
  }
  throw Error(`no account or organization with name '${name}'`);
}
