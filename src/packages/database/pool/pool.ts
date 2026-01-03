/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Client, Pool, PoolClient } from "pg";
import { syncSchema } from "@cocalc/database/postgres/schema";
import {
  pgdatabase as database,
  pghost as host,
  pguser as user,
  pgssl as ssl,
} from "@cocalc/backend/data";
import { getLogger } from "@cocalc/backend/logger";
import { STATEMENT_TIMEOUT_MS } from "../consts";
import getCachedPool, { CacheTime } from "./cached";
import dbPassword from "./password";
import { types } from "pg";
export * from "./util";
import { patchPoolForUtc } from "./pg-utc-normalize";
import {
  getPgliteClient,
  getPglitePgClient,
  getPglitePool,
  isPgliteEnabled,
  PglitePool,
} from "./pglite";

const L = getLogger("db:pool");

let pool: Pool | undefined = undefined;
let pglitePool: PglitePool | undefined = undefined;

// This makes it so when we read dates out, if they are in a "timestamp with no timezone" field in the
// database, then they are interpreted as having been UTC, which is always what we do.
types.setTypeParser(1114, (str: string) => new Date(str + " UTC"));

export default function getPool(cacheTime?: CacheTime): Pool {
  if (cacheTime != null) {
    return getCachedPool(cacheTime);
  }
  if (isPgliteEnabled()) {
    if (pglitePool == null) {
      //console.log("creating pglite pool");
      pglitePool = getPglitePool();
    }
    return pglitePool as unknown as Pool;
  }
  if (pool == null) {
    L.debug(
      `creating a new Pool(host:${host}, database:${database}, user:${user}, ssl:${JSON.stringify(ssl)} statement_timeout:${STATEMENT_TIMEOUT_MS}ms)`,
    );
    pool = new Pool({
      password: dbPassword(),
      user,
      host,
      database,
      statement_timeout: STATEMENT_TIMEOUT_MS, // fixes https://github.com/sagemathinc/cocalc/issues/6014
      // the test suite assumes small pool, or there will be random failures sometimes (?)
      max: process.env.PGDATABASE == TEST ? 2 : undefined,
      ssl,
      options: "-c timezone=UTC", // ← make the session time zone UTC
    });

    // make Dates always UTC ISO going in
    patchPoolForUtc(pool);

    pool.on("error", (err: Error) => {
      L.debug("WARNING: Unexpected error on idle client in PG pool", {
        err: err.message,
        stack: err.stack,
      });
    });
    const end = pool.end.bind(pool);
    pool.end = async () => {
      pool = undefined;
      end();
    };
  }
  return pool;
}

// CRITICAL -- the caller *must* call client.release on the client
// that is returned from getTransactionClient()!  E.g., for unit testing
// if you don't do this  you exhaust the limit of 2 on the pool size,
// (see above) and everything hangs!
export type IsolationLevel = "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";

export async function getTransactionClient(
  options: { isolationLevel?: IsolationLevel } = {},
): Promise<PoolClient> {
  const client = await getPoolClient();
  const { isolationLevel } = options;
  const beginSql = isolationLevel
    ? `BEGIN ISOLATION LEVEL ${isolationLevel}`
    : "BEGIN";
  try {
    await client.query(beginSql);
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
  if (isPgliteEnabled()) {
    return getPgliteClient() as unknown as Client;
  }
  return new Client({ password: dbPassword(), user, host, database, ssl });
}

export { getPglitePgClient, isPgliteEnabled };

// This is used for testing.  It ensures the schema is loaded and
// test database is defined.

// Call this with {reset:true} to reset the ephemeral
// database to a clean state with the schema loaded.
// You *can't* just initEphemeralDatabase({reset:true}) in the pre-amble
// of jest tests though, since all the tests are running in parallel, and
// they would mess up each other's state...
const TEST = "smc_ephemeral_testing_database";
export async function initEphemeralDatabase({
  reset,
}: { reset?: boolean } = {}) {
  if (isPgliteEnabled()) {
    await syncSchema();
    if (reset) {
      await dropAllDataPglite();
    }
    return;
  }
  if (database != TEST) {
    throw Error(
      `You can't use initEphemeralDatabase() and test using the database if the env variabe PGDATABASE is not set to ${TEST}!`,
    );
  }
  const db = new Pool({
    password: dbPassword(),
    user,
    host,
    database: "smc",
    statement_timeout: STATEMENT_TIMEOUT_MS,
    ssl,
    options: "-c timezone=UTC", // ← make the session time zone UTC
  });
  patchPoolForUtc(db);

  db.on("error", (err: Error) => {
    L.debug("WARNING: Unexpected error on idle client in PG pool", {
      err: err.message,
      stack: err.stack,
    });
  });
  const { rows } = await db.query(
    "SELECT COUNT(*) AS count FROM pg_catalog.pg_database WHERE datname = $1",
    [TEST],
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
  pool.on("error", (err: Error) => {
    L.debug("WARNING: Unexpected error on idle client in PG pool", {
      err: err.message,
      stack: err.stack,
    });
  });
  if (pool?.["options"]?.database != TEST) {
    // safety check!
    throw Error(
      `You can't use dropAllData() if the env variabe PGDATABASE is not set to ${TEST}!`,
    );
  }
  const client = await pool.connect();

  try {
    // Get all table names
    const result = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'",
    );
    const tableNames = result.rows.map((row) => row.tablename);
    await client.query(`TRUNCATE ${tableNames.join(",")}`);
  } catch (err) {
    throw err;
  } finally {
    client.release();
  }
}

async function dropAllDataPglite() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'",
    );
    const tableNames = result.rows.map((row) => row.tablename);
    if (tableNames.length > 0) {
      await client.query(`TRUNCATE ${tableNames.join(",")}`);
    }
  } finally {
    client.release();
  }
}
