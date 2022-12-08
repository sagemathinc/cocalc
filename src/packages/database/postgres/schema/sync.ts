import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { SCHEMA } from "@cocalc/util/schema";
import { quoteField } from "./util";
import { pgType } from "./pg-type";
import { createIndexesQueries } from "./indexes";
import { createTable } from "./table";

const log = getLogger("db:schema:sync");

async function syncTableSchema(table: string): Promise<void> {
  const dbg = (...args) => log.debug("syncTableSchema", table, ...args);
  dbg();
  const schema = SCHEMA[table];
  if (schema == null) {
    dbg(
      "This is an auxiliary table in the database not in our schema -- just leave it alone!"
    );
    return;
  }
  if (schema.virtual) {
    dbg("nothing to do -- table is virtual");
    return;
  }
  await syncTableSchemaColumns(table);
  await syncTableSchemaIndexes(table);
}

async function getColumnTypeInfo(
  table: string
): Promise<{ [column_name: string]: string }> {
  // may from column to type info
  const columns: { [column_name: string]: string } = {};

  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name=$1",
    [table]
  );

  for (const y of rows) {
    if (y.character_maximum_length) {
      columns[y.column_name] = `varchar(${y.character_maximum_length})`;
    } else {
      columns[y.column_name] = y.data_type;
    }
  }

  return columns;
}

async function alterColumnOfTable(
  table: string,
  action: "alter" | "add",
  column: string
): Promise<void> {
  const schema = SCHEMA[table];
  if (schema == null) {
    throw Error(`invalid table - ${table}`);
  }
  // Note: changing column ordering is NOT supported in PostgreSQL, so
  // it's critical to not depend on it!
  // https://wiki.postgresql.org/wiki/Alter_column_position
  const qTable = quoteField(table);

  const info = schema.fields[column];
  if (info == null) throw Error(`invalid column ${column}`);
  const col = quoteField(column);
  const type = pgType(info);
  let desc = type;
  if (info.unique) {
    desc += " UNIQUE";
  }
  if (info.pg_check) {
    desc += " " + info.pg_check;
  }
  if (action == "alter") {
    log.debug("alterColumnOfTable", table, "alter this column's type:", col);
    await pool.query(
      `ALTER TABLE ${qTable} ALTER COLUMN ${col} TYPE ${desc} USING ${col}::${type}`
    );
  } else if (action == "add") {
    log.debug("alterColumnOfTable", table, "add this column:", col);
    await pool.query(`ALTER TABLE ${qTable} ADD COLUMN ${col} ${desc}`);
  } else {
    throw Error(`unknown action '${action}`);
  }
}

async function syncTableSchemaColumns(table: string): Promise<void> {
  const dbg = (...args) =>
    log.debug("syncTableSchemaColumns", "table = ", table, ...args);

  dbg("getting column type info info...");
  const columnTypeInfo = await getColumnTypeInfo(table);

  dbg("altering collumns that need a change...");
  for (const column in schema.fields) {
    const info = schema.fields[column];
    let cur_type = columnTypeInfo[column]?.toLowerCase();
    if (cur_type != null) {
      cur_type = cur_type.split(" ")[0];
    }
    let goal_type = pgType(info).toLowerCase().split(" ")[0];
    if (goal_type === "serial") {
      // We can't do anything with this (or we could, but it's way too complicated).
      continue;
    }
    if (goal_type.slice(0, 4) === "char") {
      // we do NOT support changing between fixed length and variable length strength
      goal_type = "var" + goal_type;
    }
    if (cur_type == null) {
      // column is in our schema, but not in the actual database
      await alterColumnOfTable(table, "add", column);
    } else if (cur_type !== goal_type) {
      if (goal_type.includes("[]") || goal_type.includes("varchar")) {
        // NO support for array or varchar schema changes (even detecting)!
        continue;
      }
      await alterColumnOfTable(table, "alter", column);
    }
  }
}

async function getCurrentIndexes(table: string): Promise<Set<string>> {
  const pool = getPool();

  const { rows } = await pool.query(
    "SELECT c.relname AS name FROM pg_class AS a JOIN pg_index AS b ON (a.oid = b.indrelid) JOIN pg_class AS c ON (c.oid = b.indexrelid) WHERE a.relname=$1",
    [table]
  );

  const curIndexes = new Set<string>([]);
  for (const name of rows) {
    curIndexes.add(name);
  }

  return curIndexes;
}

async function updateIndex(
  table: string,
  action: "create" | "delete",
  name: string,
  query?: string
): Promise<void> {
  const pool = getPool();
  if (action == "create") {
    // ATTN if you consider adding CONCURRENTLY to create index, read the note earlier above about this
    await pool.query(`CREATE INDEX ${name} ON ${table} ${query}`);
  } else if (action == "delete") {
    await pool.query(`DROP INDEX ${name}`);
  } else {
    // typescript would catch this, but just in case:
    throw Error(`BUG: unknown action ${name}`);
  }
}

async function syncTableSchemaIndexes(table: string): Promise<void> {
  const dbg = (...args) =>
    log.debug("syncTableSchemaIndexes", "table = ", table, ...args);
  dbg();

  const curIndexes = await getCurrentIndexes(table);

  // these are the indexes we are supposed to have

  const goalIndexes = createIndexesQueries(table);
  const goalIndexNames = new Set<string>();
  const tasks = [];
  for (const x of goalIndexes) {
    goalIndexNames.add(x.name);
    if (!curIndexes.has(x.name)) {
      await updateIndex(table, "create", x.name, x.query);
    }
  }
  for (const name of curIndexes) {
    // only delete indexes that end with _idx; don't want to delete, e.g., pkey primary key indexes.
    if (name.endsWith("_idx") && !goalIndexNames.has(name)) {
      await updateIndex(table, "delete", name);
    }
  }
}

// Names of all tables actually in the database public schema.
async function getAllTables(): Promise<Set<string>> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  const v = new Set<string>();
  for (const { table_name } of rows) {
    v.add(table_name);
  }
  return v;
}

// Determine names of all tables that are in our schema but not in the
// actual database.
function getMissingTables(allTables: Set<string>): Set<string> {
  const missing = new Set<string>();
  for (const table in SCHEMA) {
    const s = SCHEMA[table];
    if (!allTables.has(table) && !s.virtual && s.durability != "ephemeral") {
      missing.add(table);
    }
  }
  return missing;
}

export async function syncSchema(): Promise<void> {
  const dbg = (...args) => log.debug("syncSchema", "table = ", table, ...args);
  dbg();

  const allTables = await getAllTables();

  // Create from scratch any missing tables -- usually this creates all tables and
  // indexes the first time around.
  const missingTables = await getMissingTables(allTables);
  for (const table of missingTables) {
    await createTable(table);
  }
  // For each table that already exists and is in the schema,
  // ensure that the columns are correct,
  // have the correct type, and all indexes exist.
  for (const table of allTables) {
    if (missingTables.has(table)) {
      // already handled above -- we created this table just a moment ago
      continue;
    }
    if (SCHEMA[table] == null) {
      // table not in our schema at all -- ignore
      continue;
    }
    // not newly created and in the schema so check if anything changed
    await syncTableSchema(table);
  }
}
