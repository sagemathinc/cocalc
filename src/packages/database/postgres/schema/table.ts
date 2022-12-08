import { SCHEMA, client_db } from "@cocalc/util/schema";
import getLogger from "@cocalc/backend/logger";
import { quoteField } from "./util";
import { pgType } from "./pg-type";
import getPool from "@cocalc/database/pool";
import { createIndexes } from "./indexes";

const log = getLogger("db:schema:table");

export function primaryKeys(table: string): string[] {
  return client_db.primary_keys(table);
}

export function primaryKey(table: string): string {
  const v = primaryKeys(table);
  if (v.length != 1) {
    throw Error(
      `compound primary key tables not yet supported - table=${table}`
    );
  }
  return v[0];
}

export async function createTable(table: string): Promise<void> {
  log.debug("createTable", table, " creating SQL query");
  const schema = SCHEMA[table];
  if (!schema) {
    throw Error(`no table '${table}' in schema`);
  }
  if (schema.virtual) {
    throw Error(`table '${table}' is virtual`);
    return;
  }
  const columns: string[] = [];
  const primary_keys = primaryKeys(table);
  for (const column in schema.fields) {
    const info = schema.fields[column];
    let s = `${quoteField(column)} ${pgType(info)}`;
    if (info.unique) {
      s += " UNIQUE";
    }
    if (info.pg_check) {
      s += " " + info.pg_check;
    }
    columns.push(s);
  }
  const query = `CREATE TABLE ${table} (${columns.join(
    ", "
  )}, PRIMARY KEY(${primary_keys.join(", ")}))`;
  log.debug("createTable", table, " running query...", query);
  const pool = getPool();
  await pool.query(query);
  await createIndexes(table);
}
