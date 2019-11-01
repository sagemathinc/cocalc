/* Utility functions used by other code here. */

import { copy, keys, is_array, deep_copy } from "../../misc2";
const { SCHEMA } = require("../../schema");

// Parse query description to allow for some convenient shortcuts
// TODO: document them here!
export function parse_query(query) {
  query = deep_copy(query);
  // TODO: convert this to Typescript...
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

const json_stable_stringify = require("json-stable-stringify");
export function to_key(x: string[] | string | undefined): string | undefined {
  if (typeof x === "object") {
    return json_stable_stringify(x);
  } else {
    return x;
  }
}
