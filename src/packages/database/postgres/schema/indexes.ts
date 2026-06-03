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
    // CONCURRENTLY avoids the table-write lock for the duration of the
    // build, which matters at hub startup on big tables (jupyter_api_log,
    // openai_chatgpt_log, project_log, etc.). The 2020-10-12 note about
    // CONCURRENTLY producing "invalid" indices in postgres 10 was traced
    // to rapid-fire issuing — this loop is `await`-serialized one at a
    // time, so that failure mode does not apply. CONCURRENTLY also
    // requires that we are NOT inside an explicit transaction; the pg
    // client auto-commits each statement, so we're fine as long as no
    // caller wraps schema sync in a BEGIN/COMMIT.
    //
    // If a previous run left an invalid index (e.g. the build was killed
    // mid-flight), `IF NOT EXISTS` skips it on the next run because the
    // name already exists. requireIndex (used by the cleanup pre-flight)
    // checks `indisvalid` and refuses to run if it sees one — operator
    // then needs to `DROP INDEX <name>;` and re-run schema sync.
    const fullQuery = `CREATE ${
      unique ? "UNIQUE" : ""
    } INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${schema.name} ${query}`;
    log.debug("createIndexes -- creating ", name, " using ", fullQuery);
    await db.query(fullQuery);
  }
}
