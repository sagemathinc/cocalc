/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool, {
  getClient,
  getTransactionClient,
  initEphemeralDatabase,
} from "./pool";
export default getPool;
export { getClient, getTransactionClient, initEphemeralDatabase };
export type { Client, PoolClient } from "pg";

export { timeInSeconds } from "./util";
