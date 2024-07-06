import { client_db } from "@cocalc/util/schema";
import getLogger from "@cocalc/backend/logger";
import { quoteField } from "./util";
import { pgType } from "./pg-type";
import type { Client } from "@cocalc/database/pool";
import { createIndexes } from "./indexes";
import type { TableSchema } from "./types";

const log = getLogger("db:schema:table");

export function primaryKeys(table: string | TableSchema): string[] {
  return client_db.primary_keys(table);
}

export function primaryKey(table: string | TableSchema): string {
  const v = primaryKeys(table);
  if (v.length != 1) {
    throw Error(
      `compound primary key tables not yet supported - table=${table}`,
    );
  }
  return v[0];
}

export async function createTable(
  db: Client,
  schema: TableSchema,
): Promise<void> {
  log.debug("createTable", schema.name, " creating SQL query");
  if (schema.virtual) {
    throw Error(`table '${schema.name}' is virtual`);
    return;
  }
  const columns: string[] = [];
  const primary_keys = primaryKeys(schema);
  for (const column in schema.fields) {
    const info = schema.fields[column];
    let s = `${quoteField(column)} ${pgType(info)}`;
    if (info.unique) {
      s += " UNIQUE";
    }
    if (info.not_null) {
      s += " NOT NULL";
    }
    if (info.pg_check) {
      s += " " + info.pg_check;
    }
    columns.push(s);
  }
  const query = `CREATE TABLE ${schema.name} (${columns.join(
    ", ",
  )}, PRIMARY KEY(${primary_keys.join(", ")}))`;
  log.debug("createTable", schema.name, " running query...", query);
  await db.query(query);
  await createIndexes(db, schema);
}
