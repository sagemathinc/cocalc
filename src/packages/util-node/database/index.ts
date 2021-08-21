/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { pghost as host, pguser as user } from "../data";
import dbPassword from "./password";
export * from "./util";

import { Pool } from "pg";
let pool: Pool | undefined = undefined;

export default function getPool(): Pool {
  if (pool == null) {
    pool = new Pool({ password: dbPassword(), user, host });
  }
  return pool;
}

export function getQuery() {
  return async (...args) => {
    return await getPool().query(...args);
  };
}
