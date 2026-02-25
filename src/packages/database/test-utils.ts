/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool from "@cocalc/database/pool";
import type { PostgreSQL } from "@cocalc/database/postgres/types";

export async function testCleanup(database?: PostgreSQL): Promise<void> {
  const dbInstance = database ?? db();
  dbInstance._clear_throttles();
  dbInstance.close?.();
  await getPool().end();
}
