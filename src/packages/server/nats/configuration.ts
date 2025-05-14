/*
Load NATS configuration from the database, in case anything is set there.
*/

import getPool from "@cocalc/database/pool";
import {
  setNatsPassword,
  setNatsServer,
  setNatsPort,
  setNatsWebsocketPort,
  setNatsAuthCalloutNSeed,
  setNatsAuthCalloutXSeed,
} from "@cocalc/backend/data";

export async function loadNatsConfiguration() {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT name, value FROM server_settings WHERE name=ANY($1)",
    [
      [
        "nats_password",
        "nats_auth_nseed",
        "nats_auth_xseed",
        "nats_port",
        "nats_ws_port",
        "nats_server",
      ],
    ],
  );
  for (const { name, value } of rows) {
    if (!value) {
      continue;
    }
    if (name == "nats_password") {
      setNatsPassword(value.trim());
    } else if (name == "nats_auth_nseed") {
      setNatsAuthCalloutNSeed(value.trim());
    } else if (name == "nats_auth_xseed") {
      setNatsAuthCalloutXSeed(value.trim());
    } else if (name == "nats_server") {
      setNatsServer(value.trim());
    } else if (name == "nats_port") {
      setNatsPort(value.trim());
    } else if (name == "nats_ws_port") {
      setNatsWebsocketPort(value.trim());
    } else {
      throw Error("bug");
    }
  }
}

/*
import { setConatServer, setConatPath } from "@cocalc/backend/data";

// configuration for a dev server; we'll use database like above in general.
export async function loadConatConfiguration() {
...
}

*/
