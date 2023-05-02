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

export function getClient(): Client {
  return new Client({ password: dbPassword(), user, host, database });
}
