/* Utility functions used by other code here. */

import { callback } from "awaiting";

const misc = require('smc-util/misc');
const schema = require('smc-util/schema');

// Parse query description to allow for some convenient shortcuts
// TODO: document them here!
export function parse_query(query) {
  if (typeof query === "string") {
    // name of a table -- get all fields
    const v = misc.copy(schema.SCHEMA[query].user_query.get.fields);
    for (let k in v) {
      const _ = v[k];
      v[k] = null;
    }
    return { [query]: [v] };
  } else {
    const keys = misc.keys(query);
    if (keys.length !== 1) {
      throw Error("must specify exactly one table");
    }
    const table = keys[0];
    const x = {};
    if (!misc.is_array(query[table])) {
      return { [table]: [query[table]] };
    } else {
      return { [table]: query[table] };
    }
  }
}

export async function callback2(f: Function, opts: any): Promise<any> {
  function g(cb): void {
    opts.cb = cb;
    f(opts);
  }
  return await callback(g);
}
