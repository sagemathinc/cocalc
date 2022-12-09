/*
Create/sync tables owned by crm.
*/

import type {
  DBSchema,
  TableSchema as TableSchema0,
} from "@cocalc/util/db-schema";
import { SCHEMA } from "@cocalc/util/db-schema";
import { copy_with, copy_without, deep_copy } from "@cocalc/util/misc";
import { syncSchema } from "@cocalc/database/postgres/schema";
import getPool from "@cocalc/database/pool";

type TableSchema = TableSchema0<any>;

function crmFields(schema: TableSchema): string[] {
  const s: string[] = [];
  if (schema.virtual) return s;
  for (const field in schema.fields) {
    if (schema.fields[field].crm) {
      s.push(field);
    }
  }
  return s;
}

// Extract a DBSchema just for the information in the database that we want
// to expose to and use for our CRM.
function crmSchema(): DBSchema {
  const crm: DBSchema = {};
  for (const name in SCHEMA) {
    const schema = SCHEMA[name];
    const fields = crmFields(schema);
    if (fields.length == 0) continue;
    crm[name] = copy_without(schema, ["fields"]);
    crm[name].fields = copy_with(schema.fields, fields);
  }
  return crm;
}

async function syncCRMSchema(): Promise<void> {
  const crm = crmSchema();
  await syncSchema(crm, "crm");
}
