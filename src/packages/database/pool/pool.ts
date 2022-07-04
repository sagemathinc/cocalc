/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  pgdatabase as database,
  pghost as host,
  pguser as user,
} from "@cocalc/backend/data";

import { Pool } from "pg";
import getCachedPool, { Length } from "./cached";
import dbPassword from "./password";
import { getLogger } from "@cocalc/backend/logger";
const L = getLogger("db:pool");

export * from "./util";

let pool: Pool | undefined = undefined;

export default function getPool(cacheLength?: Length): Pool {

  if (cacheLength != null) {
    return getCachedPool(cacheLength);
  }
  if (pool == null) {
    L.debug(`creating a new Pool`);
    pool = new Pool({ password: dbPassword(), user, host, database });
  }
  return pool;
}
