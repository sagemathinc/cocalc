/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Client, Pool } from "pg";

import {
  pgdatabase as database,
  pghost as host,
  pguser as user,
} from "@cocalc/backend/data";
import { getLogger } from "@cocalc/backend/logger";
import { STATEMENT_TIMEOUT_MS } from "../consts";
import getCachedPool, { Length } from "./cached";
import dbPassword from "./password";
import json_stable from "json-stable-stringify";

const L = getLogger("db:pool");

export * from "./util";

let pool: Pool | undefined = undefined;
let mockPool: MockPool | undefined = undefined;

export default function getPool(cacheLength?: Length): Pool {
  if (mockPool != null) {
    return mockPool as unknown as Pool;
  }
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

export function getClient(): Client {
  return new Client({ password: dbPassword(), user, host, database });
}

class MockPool {
  private mocked: { [key: string]: any[] } = {};

  private key(query: string, params: any[] | undefined): string {
    return json_stable({ query, params: params ?? [] });
  }

  mock(query: string, params: any[], rows: any[]) {
    this.mocked[this.key(query, params)] = rows;
  }

  reset() {
    this.mocked = {};
  }

  query(query: string, params?: any[]): { rows: any[] } {
    const key = this.key(query, params);
    const rows = this.mocked[key];
    if (rows == null) {
      throw Error(`Add this:   pool.mock("${query}",${JSON.stringify(params)}, [])`);
    }
    // console.log({ query, params, rows });
    return { rows };
  }
}

export function getMockPool() {
  if (mockPool == null) {
    mockPool = new MockPool();
  }
  return mockPool;
}
