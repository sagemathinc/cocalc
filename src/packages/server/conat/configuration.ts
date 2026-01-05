/*
Load Conat configuration from the database, in case anything is set there.
*/

import getPool from "@cocalc/database/pool";
import {
  conatPassword,
  conatPasswordPath,
  setConatServer,
  setConatPassword,
} from "@cocalc/backend/data";
import { secureRandomString } from "@cocalc/backend/misc";
import { writeFile } from "fs/promises";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:conat:configuration");

export async function loadConatConfiguration() {
  logger.debug("loadConatConfiguration");
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT name, value FROM server_settings WHERE name=ANY($1)",
    [["conat_server", "conat_password"]],
  );
  let passworkConfigured = !!conatPassword;
  for (const { name, value } of rows) {
    if (!value) {
      continue;
    }
    logger.debug("loadConatConfiguration -- ", name);
    if (name == "conat_password") {
      if (value.trim()) {
        passworkConfigured = true;
      }
      setConatPassword(value.trim());
    } else if (name == "conat_server") {
      setConatServer(value.trim());
    } else {
      throw Error("bug");
    }
  }

  if (!passworkConfigured) {
    await initConatPassword();
  }
}

async function initConatPassword() {
  logger.debug("initConatPassword");
  const password = await secureRandomString(32);
  setConatPassword(password);
  try {
    await writeFile(conatPasswordPath, password);
  } catch (err) {
    logger.debug("initConatPassword: WARNING -- failed -- ", err);
  }
}
