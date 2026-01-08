/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Client, Pool, PoolClient } from "pg";
import { schemaNeedsSync, syncSchema } from "@cocalc/database/postgres/schema";
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

const L = getLogger("db:pool");

export * from "./util";

let pool: Pool | undefined = undefined;
let ensureExistsPromise: Promise<void> | undefined = undefined;
let ensureSchemaPromise: Promise<void> | undefined = undefined;

export type PoolOptions = {
  cacheTime?: CacheTime;
  ensureExists?: boolean;
};

export type PoolOptionInput = CacheTime | PoolOptions | undefined;

function normalizePoolOptions(opts?: PoolOptionInput): PoolOptions {
  if (typeof opts === "string") {
    return { cacheTime: opts };
  }
  return opts ?? {};
}

function getPrimaryHost(): { host?: string; port: number } {
  const hostEntry = host ?? "";
  if (!hostEntry) {
    return { host: undefined, port: 5432 };
  }
  if (hostEntry.includes("/")) {
    return { host: hostEntry, port: 5432 };
  }
  if (hostEntry.includes(":")) {
    const [hostname, portStr] = hostEntry.split(":");
    const parsedPort = Number.parseInt(portStr ?? "", 10);
    return {
      host: hostname,
      port: Number.isFinite(parsedPort) ? parsedPort : 5432,
    };
  }
  return { host: hostEntry, port: 5432 };
}

const SCHEMA_LOCK_KEY = 0x434f4341;
const SCHEMA_LOCK_WAIT_MS = 1000;

// Advisory locks are session-scoped; if this client dies, Postgres releases them.
// This assumes direct Postgres connections (pgBouncer transaction pooling breaks
// session-level advisory locks).
async function ensureSchemaReady(): Promise<void> {
  if (!(await schemaNeedsSync())) {
    return;
  }

  const lockClient = getClient();
  await lockClient.connect();
  try {
    while (true) {
      const { rows } = await lockClient.query(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [SCHEMA_LOCK_KEY],
      );
      if (rows[0]?.locked) {
        try {
          if (await schemaNeedsSync()) {
            await syncSchema();
          }
        } finally {
          await lockClient.query("SELECT pg_advisory_unlock($1)", [
            SCHEMA_LOCK_KEY,
          ]);
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, SCHEMA_LOCK_WAIT_MS));
      if (!(await schemaNeedsSync())) {
        return;
      }
    }
  } finally {
    await lockClient.end().catch(() => undefined);
  }
}

async function ensureDatabaseExists(): Promise<void> {
  const { host: primaryHost, port } = getPrimaryHost();
  const password = dbPassword();
  const maintenanceDb = "postgres";
  const escapedDatabase = database.replace(/"/g, '""');
  const client = new Client({
    user,
    host: primaryHost,
    port,
    password,
    database: maintenanceDb,
    ssl,
  });
  try {
    await client.connect();
    const { rows } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [database],
    );
    if (rows.length === 0) {
      try {
        await client.query(`CREATE DATABASE "${escapedDatabase}"`);
      } catch (err) {
        if ((err as { code?: string })?.code !== "42P04") {
          throw err;
        }
      }
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

export default function getPool(options?: PoolOptionInput): Pool {
  const { cacheTime, ensureExists = true } = normalizePoolOptions(options);
  if (cacheTime != null) {
    return getCachedPool({ cacheTime, ensureExists });
  }
  if (pool == null) {
    if (ensureExists && ensureExistsPromise == null) {
      ensureExistsPromise = ensureDatabaseExists().catch((err) => {
        ensureExistsPromise = undefined;
        throw err;
      });
    }
    if (ensureExists && ensureSchemaPromise == null) {
      const base = ensureExistsPromise ?? Promise.resolve();
      ensureSchemaPromise = base.then(ensureSchemaReady).catch((err) => {
        ensureSchemaPromise = undefined;
        throw err;
      });
    }
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
    });

    pool.on("error", (err: Error) => {
      L.debug("WARNING: Unexpected error on idle client in PG pool", {
        err: err.message,
        stack: err.stack,
      });
    });
    const end = pool.end.bind(pool);
    const connect = pool.connect.bind(pool);
    const query = pool.query.bind(pool);
    const ensureReady = async (): Promise<void> => {
      const readyPromises: Array<Promise<void>> = [];
      if (ensureExistsPromise != null) {
        readyPromises.push(ensureExistsPromise);
      }
      if (ensureSchemaPromise != null) {
        readyPromises.push(ensureSchemaPromise);
      }
      if (readyPromises.length > 0) {
        await Promise.all(readyPromises);
      }
    };

    pool.end = async () => {
      pool = undefined;
      ensureExistsPromise = undefined;
      ensureSchemaPromise = undefined;
      return await end();
    };

    if (ensureExistsPromise != null || ensureSchemaPromise != null) {
      pool.connect = ((...args: any[]) => {
        const lastArg = args[args.length - 1];
        if (typeof lastArg === "function") {
          void ensureReady()
            .then(() => connect(...args))
            .catch((err) => lastArg(err));
          return undefined as any;
        }
        return ensureReady().then(() => connect(...args));
      }) as Pool["connect"];
      pool.query = ((...args: any[]) => {
        const lastArg = args[args.length - 1];
        if (typeof lastArg === "function") {
          void ensureReady()
            .then(() => query(...args))
            .catch((err) => lastArg(err));
          return undefined as any;
        }
        return ensureReady().then(() => query(...args));
      }) as Pool["query"];
    }
  }
  return pool;
}

// CRITICAL -- the caller *must* call client.release on the client
// that is returned from getTransactionClient()!  E.g., for unit testing
// if you don't do this  you exhaust the limit of 2 on the pool size,
// (see above) and everything hangs!
export async function getTransactionClient(
  options?: PoolOptionInput,
): Promise<PoolClient> {
  const client = await getPoolClient(options);
  try {
    await client.query("BEGIN");
  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    throw err;
  }
  return client;
}

export async function getPoolClient(
  options?: PoolOptionInput,
): Promise<PoolClient> {
  const pool = await getPool(options);
  return await pool.connect();
}

export function getClient(): Client {
  return new Client({ password: dbPassword(), user, host, database, ssl });
}

const TEST = "smc_ephemeral_testing_database";

/**
 * Initialize the ephemeral test database and ensure the schema is loaded.
 *
 * Call with `{ reset: true }` to truncate all tables after schema sync.
 * Do not run `initEphemeralDatabase({ reset: true })` in test preambles,
 * since parallel tests can interfere with each other's state.
 *
 * @param options
 * @param options.reset When true, truncates all tables after schema sync.
 */
export async function initEphemeralDatabase({
  reset,
}: { reset?: boolean } = {}) {
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
  });
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
