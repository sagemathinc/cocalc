/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Client, Pool, PoolClient } from "pg";
import { syncSchema } from "@cocalc/database/postgres/schema";

import {
  pgdatabase as database,
  pghost as host,
  pguser as user,
} from "@cocalc/backend/data";
import { getLogger } from "@cocalc/backend/logger";
import { STATEMENT_TIMEOUT_MS } from "../consts";
import getCachedPool, { Length } from "./cached";
import dbPassword from "./password";

const L = getLogger("db:pool");

export * from "./util";

let pool: Pool | undefined = undefined;

export default function getPool(cacheLength?: Length): Pool {
  if (cacheLength != null) {
    return getCachedPool(cacheLength);
  }
  if (pool == null) {
    L.debug(
      `creating a new Pool(host:${host}, database:${database}, user:${user}, statement_timeout:${STATEMENT_TIMEOUT_MS}ms)`
    );
    pool = new Pool({
      password: dbPassword(),
      user,
      host,
      database,
      statement_timeout: STATEMENT_TIMEOUT_MS, // fixes https://github.com/sagemathinc/cocalc/issues/6014
    });
  }
  return pool;
}

export async function getTransactionClient(): Promise<PoolClient> {
  const client = await getPoolClient();
  try {
    await client.query("BEGIN");
  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    throw err;
  }
  return client;
}

export async function getPoolClient(): Promise<PoolClient> {
  const pool = await getPool();
  return await pool.connect();
}

export function getClient(): Client {
  return new Client({ password: dbPassword(), user, host, database });
}

// This is used for testing.  Call this to reset the ephemeral
// database to a clean state with the schema loaded.
const TEST = "smc_ephemeral_testing_database";
export async function initEphemeralDatabase({
  reset,
}: { reset?: boolean } = {}) {
  if (database != TEST) {
    throw Error(
      `You can't use initEphemeralDatabase() and test using the database if the env variabe PGDATABASE is not set to ${TEST}!`
    );
  }
  const db = new Pool({
    password: dbPassword(),
    user,
    host,
    database: "smc",
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });
  const { rows } = await db.query(
    "SELECT COUNT(*) AS count FROM pg_catalog.pg_database WHERE datname = $1",
    [TEST]
  );
  //await db.query(`DROP DATABASE IF EXISTS ${TEST}`);
  const databaseExists = rows[0].count > 0;
  if (!databaseExists) {
    await db.query(`CREATE DATABASE ${TEST}`);
  }
  await db.end();
  // sync the schema
  await syncSchema();
  if (databaseExists && reset) {
    // Drop all data from all tables for a clean slate.
    // Unfortunately, this can take a little while.
    await dropAllData();
  }
}

async function dropAllData() {
  const pool = getPool();
  if (pool?.["options"]?.database != TEST) {
    // safety check!
    throw Error(
      `You can't use dropAllData() if the env variabe PGDATABASE is not set to ${TEST}!`
    );
  }
  const client = await pool.connect();

  try {
    // Get all table names
    const result = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'"
    );
    const tableNames = result.rows.map((row) => row.tablename);
    await client.query(`TRUNCATE ${tableNames.join(",")}`);
  } catch (err) {
    throw err;
  } finally {
    client.release();
  }
}
