/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { copy, keys, is_array, deep_copy } from "@cocalc/util/misc";
import { SCHEMA } from "@cocalc/util/schema";

// Parse query description to allow for some convenient shortcuts
// TODO: document them here!
export function parse_query(query) {
  query = deep_copy(query);
  if (typeof query === "string") {
    // name of a table -- get all fields
    const s = SCHEMA[query];
    if (s == null) throw Error(`no schema for query "${query}"`);
    if (s.user_query == null)
      throw Error(`user_query not defined for query "${query}"`);
    if (s.user_query.get == null)
      throw Error(`user_query.get not defined for query "${query}"`);
    const v = copy(s.user_query.get.fields);
    for (const k in v) {
      v[k] = null;
    }
    return { [query]: [v] };
  } else {
    const k = keys(query);
    if (k.length !== 1) {
      throw Error("must specify exactly one table");
    }
    const table = k[0];
    if (!is_array(query[table])) {
      return { [table]: [query[table]] };
    } else {
      return { [table]: query[table] };
    }
  }
}

export function parseQueryWithOptions(query, options) {
  query = parse_query(query);
  const table = keys(query)[0];
  const obj = options?.obj;
  if (obj != null) {
    for (const k in obj) {
      query[table][0][k] = obj[k];
    }
  }
  if (options?.project_id != null && query[table][0]["project_id"] === null) {
    query[table][0]["project_id"] = options.project_id;
  }
  return { query, table };
}

const json_stable_stringify = require("json-stable-stringify");
export function to_key(x): string | undefined {
  if (x === undefined) {
    return undefined;
  } else if (typeof x === "object") {
    return json_stable_stringify(x);
  } else {
    return `${x}`;
  }
}
