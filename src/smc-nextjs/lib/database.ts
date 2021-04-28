/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Pool } from "pg";
// TODO: need to deal with auth....
const pool = new Pool();

export default function getPool() {
  return pool;
}
