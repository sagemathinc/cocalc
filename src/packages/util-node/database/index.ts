/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { dbPassword } from "../data";
export * from "./util";

import { Pool } from "pg";
const pool = new Pool({ password: dbPassword() });

export default function getPool() {
  return pool;
}

export function getQuery() {
  return async (...args) => {
    return await getPool().query(...args);
  };
}
