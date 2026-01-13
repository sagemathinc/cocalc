import { getClient, Client } from "@cocalc/database/pool";
import type { DBSchema, TableSchema } from "./types";
import { quoteField } from "./util";
import { pgType } from "./pg-type";
import { createIndexesQueries } from "./indexes";
import { createTable } from "./table";
import getLogger from "@cocalc/backend/logger";
import { SCHEMA } from "@cocalc/util/schema";
import { dropDeprecatedTables } from "./drop-deprecated-tables";
import { primaryKeys } from "./table";
import { isEqual } from "lodash";

const log = getLogger("db:schema:sync");

async function syncTableSchema(db: Client, schema: TableSchema): Promise<void> {
  const dbg = (...args) => log.debug("syncTableSchema", schema.name, ...args);
  dbg();
  if (schema.virtual) {
    dbg("nothing to do -- table is virtual");
    return;
  }
  await syncTableSchemaColumns(db, schema);
  await syncTableSchemaIndexes(db, schema);
  await syncTableSchemaPrimaryKeys(db, schema);
}

async function getColumnTypeInfo(
  db: Client,
  table: string,
): Promise<{ [column_name: string]: string }> {
  // may from column to type info
  const columns: { [column_name: string]: string } = {};

  const { rows } = await db.query(
    "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name=$1",
    [table],
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

function parseTriggerDependencyError(
  err: unknown,
  table: string,
): { trigger: string; table: string } | null {
  if (err == null || typeof err !== "object") {
    return null;
  }
  const pgErr = err as { code?: string; detail?: string };
  if (pgErr.code !== "0A000" || typeof pgErr.detail !== "string") {
    return null;
  }
  const match = pgErr.detail.match(
    /trigger ([^ ]+) on table ([^ ]+) depends on column/,
  );
  if (!match) {
    return null;
  }
  const trigger = match[1];
  const triggerTable = match[2];
  const normalizedTable = triggerTable.includes(".")
    ? triggerTable.split(".").pop()
    : triggerTable;
  if (!trigger.startsWith("change_") || normalizedTable !== table) {
    return null;
  }
  return { trigger, table: normalizedTable };
}

async function alterColumnOfTable(
  db: Client,
  schema: TableSchema,
  action: "alter" | "add",
  column: string,
): Promise<void> {
  // Note: changing column ordering is NOT supported in PostgreSQL, so
  // it's critical to not depend on it!
  // https://wiki.postgresql.org/wiki/Alter_column_position
  const qTable = quoteField(schema.name);

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
    log.debug(
      "alterColumnOfTable",
      schema.name,
      "alter this column's type:",
      col,
    );
    const query = `ALTER TABLE ${qTable} ALTER COLUMN ${col} TYPE ${desc} USING ${col}::${type}`;
    try {
      await db.query(query);
    } catch (err) {
      const dependency = parseTriggerDependencyError(err, schema.name);
      if (!dependency) {
        throw err;
      }
      log.debug(
        "alterColumnOfTable",
        schema.name,
        "dropping trigger",
        dependency.trigger,
        "on",
        dependency.table,
      );
      await db.query(
        `DROP TRIGGER IF EXISTS ${quoteField(dependency.trigger)} ON ${quoteField(
          dependency.table,
        )}`,
      );
      await db.query(
        `DROP FUNCTION IF EXISTS ${quoteField(dependency.trigger)}()`,
      );
      await db.query(query);
    }
  } else if (action == "add") {
    log.debug("alterColumnOfTable", schema.name, "add this column:", col);
    await db.query(`ALTER TABLE ${qTable} ADD COLUMN ${col} ${desc}`);
  } else {
    throw Error(`unknown action '${action}`);
  }
}

async function syncTableSchemaColumns(
  db: Client,
  schema: TableSchema,
): Promise<void> {
  // log.debug("syncTableSchemaColumns", "table = ", schema.name);
  const columnTypeInfo = await getColumnTypeInfo(db, schema.name);

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
      await alterColumnOfTable(db, schema, "add", column);
    } else if (cur_type !== goal_type) {
      if (goal_type.includes("[]") || goal_type.includes("varchar")) {
        // NO support for array or varchar schema changes (even detecting)!
        continue;
      }
      await alterColumnOfTable(db, schema, "alter", column);
    }
  }
}

async function getCurrentIndexes(
  db: Client,
  table: string,
): Promise<Set<string>> {
  const { rows } = await db.query(
    "SELECT c.relname AS name FROM pg_class AS a JOIN pg_index AS b ON (a.oid = b.indrelid) JOIN pg_class AS c ON (c.oid = b.indexrelid) WHERE a.relname=$1",
    [table],
  );

  const curIndexes = new Set<string>([]);
  for (const { name } of rows) {
    curIndexes.add(name);
  }

  return curIndexes;
}

// There is also code in database/postgres/schema/indexes.ts that creates indexes.

async function updateIndex(
  db: Client,
  table: string,
  action: "create" | "delete",
  name: string,
  query?: string,
  unique?: boolean,
): Promise<void> {
  log.debug("updateIndex", { table, action, name });
  if (action == "create") {
    // ATTN if you consider adding CONCURRENTLY to create index, read the note earlier above about this
    await db.query(
      `CREATE ${unique ? "UNIQUE" : ""} INDEX ${name} ON ${table} ${query}`,
    );
  } else if (action == "delete") {
    await db.query(`DROP INDEX ${name}`);
  } else {
    // typescript would catch this, but just in case:
    throw Error(`BUG: unknown action ${name}`);
  }
}

async function syncTableSchemaIndexes(
  db: Client,
  schema: TableSchema,
): Promise<void> {
  //   const dbg = (...args) =>
  //     log.debug("syncTableSchemaIndexes", "table = ", schema.name, ...args);
  //   dbg();

  const curIndexes = await getCurrentIndexes(db, schema.name);
  //dbg("curIndexes", curIndexes);

  // these are the indexes we are supposed to have

  const goalIndexes = createIndexesQueries(schema);
  // dbg("goalIndexes", goalIndexes);
  const goalIndexNames = new Set<string>();
  for (const x of goalIndexes) {
    goalIndexNames.add(x.name);
    if (!curIndexes.has(x.name)) {
      await updateIndex(db, schema.name, "create", x.name, x.query, x.unique);
    }
  }
  for (const name of curIndexes) {
    // only delete indexes that end with _idx; don't want to delete, e.g., pkey primary key indexes.
    if (name.endsWith("_idx") && !goalIndexNames.has(name)) {
      await updateIndex(db, schema.name, "delete", name);
    }
  }
}

// Names of all tables owned by the current user.
async function getAllTables(db: Client): Promise<Set<string>> {
  const { rows } = await db.query(
    "SELECT tablename FROM pg_tables WHERE tableowner = current_user",
  );
  const v = new Set<string>();
  for (const { tablename } of rows) {
    v.add(tablename);
  }
  return v;
}

// Determine names of all tables that are in our schema but not in the
// actual database.
function getMissingTables(
  dbSchema: DBSchema,
  allTables: Set<string>,
): Set<string> {
  const missing = new Set<string>();
  for (const table in dbSchema) {
    const s = dbSchema[table];
    if (
      !allTables.has(table) &&
      !s.virtual &&
      !s.external &&
      s.durability != "ephemeral"
    ) {
      missing.add(table);
    }
  }
  return missing;
}

export async function syncSchema(
  dbSchema: DBSchema = SCHEMA,
  role?: string,
): Promise<void> {
  const dbg = (...args) => log.debug("syncSchema", { role }, ...args);
  dbg();

  // We use a single connection for the schema update so that it's possible
  // to set the role for that connection without causing any side effects
  // elsewhere.
  const db = getClient();
  try {
    await db.connect();
    if (role) {
      // change to that user for the rest of this connection.
      await db.query(`SET ROLE ${role}`);
    }
    dbg("dropping any deprecated tables");
    await dropDeprecatedTables(db);

    const allTables = await getAllTables(db);
    // dbg("allTables", allTables);

    // Create from scratch any missing tables -- usually this creates all tables and
    // indexes the first time around.
    const missingTables = await getMissingTables(dbSchema, allTables);
    dbg("missingTables", missingTables);
    for (const table of missingTables) {
      dbg("create missing table", table);
      const schema = dbSchema[table];
      if (schema == null) {
        throw Error("BUG -- inconsistent schema");
      }
      await createTable(db, schema);
    }
    // For each table that already exists and is in the schema,
    // ensure that the columns are correct,
    // have the correct type, and all indexes exist.
    for (const table of allTables) {
      if (missingTables.has(table)) {
        // already handled above -- we created this table just a moment ago
        continue;
      }
      const schema = dbSchema[table];
      if (schema == null || schema.external) {
        // table not in our schema at all or managed externally -- ignore
        continue;
      }
      // not newly created and in the schema so check if anything changed
      //dbg("sync existing table", table);
      await syncTableSchema(db, schema);
    }
  } catch (err) {
    dbg("FAILED to sync schema ", { role }, err);
    throw err;
  } finally {
    db.end();
  }
}

async function syncTableSchemaPrimaryKeys(
  db: Client,
  schema: TableSchema,
): Promise<void> {
  // log.debug("syncTableSchemaPrimaryKeys", "table = ", schema.name);
  const actualPrimaryKeys = (await getPrimaryKeys(db, schema.name)).sort();
  const goalPrimaryKeys = primaryKeys(schema.name).sort();
  if (isEqual(actualPrimaryKeys, goalPrimaryKeys)) {
    return;
  }
  //   log.debug("syncTableSchemaPrimaryKeys", "table = ", schema.name, {
  //     actualPrimaryKeys,
  //     goalPrimaryKeys,
  //   });
  for (const key of goalPrimaryKeys) {
    if (!actualPrimaryKeys.includes(key)) {
      const defaultValue = schema.default_primary_key_value?.[key];
      if (defaultValue == null) {
        throw Error(
          `must specify default_primary_key_value for '${schema.name}' and key='${key}'`,
        );
      } else {
        await db.query(`update "${schema.name}" set "${key}"=$1`, [
          defaultValue,
        ]);
      }
    }
  }
  await db.query(`
ALTER TABLE "${schema.name}" DROP CONSTRAINT ${schema.name}_pkey;
`);
  await db.query(`
  ALTER TABLE "${schema.name}" ADD PRIMARY KEY (${goalPrimaryKeys
    .map((name) => `"${name}"`)
    .join(",")})
`);
}

async function getPrimaryKeys(db: Client, table: string): Promise<string[]> {
  const { rows } = await db.query(`
SELECT a.attname as name
FROM   pg_index i
JOIN   pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
WHERE  i.indrelid = '${table}'::regclass
AND    i.indisprimary
`);
  return rows.map((row) => row.name);
}
