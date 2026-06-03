/*
Drop ancient deprecated tables in some cases.

This doesn't work via any generic schema, but is some very specific code.
*/

import type { Client } from "@cocalc/database/pool";

export async function hasDeprecatedTables(db: Client): Promise<boolean> {
  // There was a table compute_servers used from 2013-2016 with a primary key host.
  // We drop that table from the database if it exists *with that primary key*.
  // During sync we will then create the new compute_servers table, which has
  // primary key "id", is modern, and does something completely different.
  const result = await db.query(`SELECT EXISTS (
    SELECT FROM pg_class c
    JOIN pg_namespace n on n.oid = c.relnamespace
    WHERE c.relkind = 'r'
    AND n.nspname = 'public'
    AND c.relname = 'compute_servers'
    AND exists (
        SELECT 1
        FROM pg_attribute attr
        JOIN pg_index idx on idx.indrelid = attr.attrelid
              and idx.indkey[0] = attr.attnum
        WHERE idx.indrelid = c.oid
        AND idx.indisprimary
        AND attr.attname = 'host'
    ));`);

  return Boolean(result.rows[0]?.exists);
}

export async function dropDeprecatedTables(db: Client) {
  if (await hasDeprecatedTables(db)) {
    await db.query(`DROP TABLE compute_servers;`);
  }
}
