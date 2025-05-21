/*
Load Conat configuration from the database, in case anything is set there.
*/

import getPool from "@cocalc/database/pool";
import {
  setConatServer,
  setConatPath,
  setConatPassword,
} from "@cocalc/backend/data";

export async function loadConatConfiguration() {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT name, value FROM server_settings WHERE name=ANY($1)",
    [["conat_server", "conat_path", "conat_password"]],
  );
  for (const { name, value } of rows) {
    if (!value) {
      continue;
    }
    if (name == "conat_password") {
      setConatPassword(value.trim());
    } else if (name == "conat_server") {
      setConatServer(value.trim());
    } else if (name == "conat_path") {
      setConatPath(value.trim());
    } else {
      throw Error("bug");
    }
  }
}
