import { db } from "@cocalc/database";
import getPool from "@cocalc/database/pool";
import type { PostgreSQL } from "@cocalc/database/postgres/types";

export async function testCleanup(database?: PostgreSQL): Promise<void> {
  const dbInstance = database ?? db();
  dbInstance._clear_throttles();
  dbInstance._close_test_query?.();
  await getPool().end();
}
