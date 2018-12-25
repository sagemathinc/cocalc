/* Utility functions used by other code here. */

const misc = require("smc-util/misc");
const schema = require("smc-util/schema");

// Parse query description to allow for some convenient shortcuts
// TODO: document them here!
export function parse_query(query) {
  if (typeof query === "string") {
    // name of a table -- get all fields
    const s = schema.SCHEMA[query];
    if (s == null) throw Error(`no schemea for query ${query}`);
    if (s.user_query == null)
      throw Error(`user_query not defined for query ${query}`);
    if (s.user_query.get == null)
      throw Error(`user_query.get not defined for query ${query}`);
    const v = misc.copy(s.user_query.get.fields);
    for (let k in v) {
      v[k] = null;
    }
    return { [query]: [v] };
  } else {
    const keys = misc.keys(query);
    if (keys.length !== 1) {
      throw Error("must specify exactly one table");
    }
    const table = keys[0];
    if (!misc.is_array(query[table])) {
      return { [table]: [query[table]] };
    } else {
      return { [table]: query[table] };
    }
  }
}

import * as json_stable_stringify from "json-stable-stringify";
export function to_key(x: string[] | string | undefined): string | undefined {
  if (typeof x === "object") {
    return json_stable_stringify(x);
  } else {
    return x;
  }
}
