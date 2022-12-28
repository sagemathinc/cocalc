/*
Do a set to the backend database, filling in all create and update fields.
*/

import { getDBTableDescription } from "../tables";
import { cloneDeep } from "lodash";
import { client_db } from "@cocalc/util/db-schema";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export default async function set(query: object) {
  query = cloneDeep(query);
  const table = Object.keys(query)[0];
  const { createDefaults, updateDefaults } = getDBTableDescription(table);

  if (isCreate(table, query) && createDefaults != null) {
    if (createDefaults != null) {
      for (const key in createDefaults) {
        if (query[table][key] == null) {
          query[table][key] = createDefaults[key];
        }
      }
    }
  }

  if (updateDefaults != null) {
    for (const key in updateDefaults) {
      if (query[table][key] == null) {
        query[table][key] = updateDefaults[key];
      }
    }
  }
  await webapp_client.query_client.query({
    query,
    options: [{ set: true }],
  });
}

// Heuristic: we are creating a new object in database if a primary key is missing.
// This works is because the primary key (or keys) are assigned by the database in
// all cases.
function isCreate(table: string, query: object): boolean {
  for (const primary_key of client_db.primary_keys(table)) {
    if (query[table][primary_key] == null) {
      return true;
    }
  }
  return false;
}
