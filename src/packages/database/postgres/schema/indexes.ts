import getLogger from "@cocalc/backend/logger";
import type { Client } from "@cocalc/database/pool";
import type { TableSchema } from "./types";
import { make_valid_name } from "@cocalc/util/misc";

const log = getLogger("db:schema:indexes");

function possiblyAddParens(query: string): string {
  if (query[0] == "(") {
    return query;
  }
  if (query.toLowerCase().startsWith("using")) {
    // do not add for using queries, since that violates PostgreSQL syntax
    return query;
  }
  return `(${query})`;
}

export function createIndexesQueries(
  schema: TableSchema
): { name: string; query: string; unique: boolean }[] {
  const v = schema.pg_indexes ?? [];
  if (schema.fields.expire != null && !v.includes("expire")) {
    v.push("expire");
  }
  const queries: { name: string; query: string; unique: boolean }[] = [];
  for (let query of v) {
    query = query.trim();
    const name = `${schema.name}_${make_valid_name(query)}_idx`; // this first, then...
    query = possiblyAddParens(query);
    queries.push({ name, query, unique: false });
  }
  const w = schema.pg_unique_indexes ?? [];
  for (let query of w) {
    query = query.trim();
    const name = `${schema.name}_${make_valid_name(query)}_unique_idx`;
    query = possiblyAddParens(query);
    queries.push({ name, query, unique: true });
  }
  return queries;
}

// IMPORTANT: There is also code in database/postgres/schema/sync.ts that creates indexes.
export async function createIndexes(
  db: Client,
  schema: TableSchema
): Promise<void> {
  log.debug("createIndexes", schema.name, " creating SQL query");
  for (const { name, query, unique } of createIndexesQueries(schema)) {
    // Shorthand index is just the part in parens.
    // 2020-10-12: it makes total sense to add CONCURRENTLY to this index command to avoid locking up the table,
    // but the first time we tried this in production (postgres 10), it just made "invalid" indices.
    // the problem might be that several create index commands were issued rapidly, which threw this off
    // So, for now, it's probably best to either create them manually first (concurrently) or be
    // aware that this does lock up briefly.
    const fullQuery = `CREATE ${unique ? "UNIQUE" : ""} INDEX ${name} ON ${
      schema.name
    } ${query}`;
    log.debug("createIndexes -- creating ", name, " using ", fullQuery);
    await db.query(fullQuery);
  }
}
