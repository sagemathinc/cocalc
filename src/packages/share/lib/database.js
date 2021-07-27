/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const { Pool } = require("pg");
// TODO: need to deal with auth....
const pool = new Pool();

module.exports = function getPool() {
  return pool;
};
