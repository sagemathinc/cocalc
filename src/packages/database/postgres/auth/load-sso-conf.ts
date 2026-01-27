/*
 *  This file is part of CoCalc: Copyright © 2022-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { lstat, readFile, realpath } from "fs/promises";
import type { PoolClient } from "pg";

import getLogger from "@cocalc/backend/logger";
import type { PostgreSQL } from "@cocalc/database/postgres/types";

const L = getLogger("auth:sso:import-sso-configuration").debug;

// The path to the file. In actual use, this is a K8S secret exported as a file to /secrets/sso/sso.json
// content of that file: "{ [strategy name]: {conf: {…}, info: {…}}, […] : { … } | null, … }"
// further details are describe in src/packages/server/auth/sso/types.ts
const SSO_JSON = process.env.COCALC_SSO_CONFIG;

// This function imports the SSO configuration from a file into the database.
// If a key points to "null", the entry is deleted.
// This runs only once during startup, called by the hub's auth.ts.
export async function loadSSOConf(db: PostgreSQL): Promise<void> {
  if (SSO_JSON == null) {
    L("No SSO configuration file specified via $COCALC_SSO_CONFIG.");
    return;
  }

  // test if the path at SSO_JSON is a regular file and is readable
  try {
    // the file could be a symlink, we have to resolve it
    const ssofn = await realpath(SSO_JSON);
    const stats = await lstat(ssofn);
    if (!stats.isFile()) {
      L(`SSO configuration file ${SSO_JSON} is not a regular file`);
      return;
    }
  } catch (err) {
    L(`SSO configuration file ${SSO_JSON} does not exist or is not readable`);
    return;
  }
  await load(db);
}

async function load(db: PostgreSQL) {
  if (SSO_JSON == null) {
    throw new Error("SSO_JSON is not defined, should never happen");
  }
  // load the json data stored in the file SSO_JSON
  L(`Loading SSO configuration from '${SSO_JSON}'`);

  let client: PoolClient;
  try {
    client = await db._get_query_client();
  } catch (err) {
    L(`no database client available -- skipping SSO configuration`);
    return;
  }

  // throws upon JSON parsing errors
  const data = JSON.parse(await readFile(SSO_JSON, "utf8"));

  try {
    await client.query("BEGIN");
    for (const strategy in data) {
      const val = data[strategy];
      if (val == null) {
        await deleteSSO(client, strategy);
      } else {
        await upsertSSO(client, strategy, val);
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    L(`ROLLBACK -- err=${err}`);
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
}

const deleteQuery = `
DELETE FROM passport_settings
WHERE strategy = $1`;

async function deleteSSO(client: PoolClient, strategy: string) {
  L(`Deleting SSO configuration for ${strategy}`);
  await client.query(deleteQuery, [strategy]);
}

const upsertQuery = `
INSERT INTO passport_settings (strategy, conf, info)
VALUES ($1, $2, $3)
ON CONFLICT (strategy) DO UPDATE SET conf = $2, info = $3`;

async function upsertSSO(
  client: PoolClient,
  strategy: string,
  val: { conf: object; info: object },
) {
  const { conf, info } = val;
  L(`Updating SSO configuration for ${strategy}:`, { conf, info });
  await client.query(upsertQuery, [strategy, conf, info]);
}
