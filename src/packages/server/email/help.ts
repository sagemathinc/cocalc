/* Returns the configured help email address.
   Cached with "long" TTL so doesn't put load on database
   even if called frequently.
*/

import getPool from "@cocalc/backend/database";

export default async function getHelpEmail(): Promise<string> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT value FROM server_settings WHERE name='help_email'"
  );
  if (rows.length == 0 || !rows[0].value) {
    throw Error("no help email address set");
  }
  return rows[0].value;
}
