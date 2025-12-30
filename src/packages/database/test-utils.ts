import getPool from "@cocalc/database/pool";
import type { PostgreSQL } from "@cocalc/database/postgres/types";

export async function testCleanup(database: PostgreSQL): Promise<void> {
  database._clear_throttles();
  database._close_test_query?.();
  await getPool().end();
}
