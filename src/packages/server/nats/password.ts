/*
Load NATS credential from the database and set them so they
are used by all NATS connections by this hub server process.
*/

import getPool from "@cocalc/database/pool";
import { setNatsPassword } from "@cocalc/backend/data";

export async function loadNatsPassword() {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT value FROM server_settings WHERE name='nats_password'",
  );
  if (rows.length > 0 && rows[0].value) {
    setNatsPassword(rows[0].value.trim());
  }
}
