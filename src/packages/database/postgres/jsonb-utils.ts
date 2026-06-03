/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { is_date as isDate } from "@cocalc/util/misc";

/*
jsonbSet: This little piece of very hard to write (and clever?) code
makes it so we can set or **merge in at any nested level** (!)
arbitrary JSON objects.  We can also delete any key at any
level by making the value null or undefined!  This is amazingly
easy to use in queries -- basically making JSONP with postgres
as expressive as RethinkDB REQL (even better in some ways).
*/

// The input desc is an object that describes what is being set, e.g.,
//     account_id = '... some uuid ';
//     desc = {"users": {[account_id]:{group:'collaborator'}}}
// changes the users JSONB field of the table so that users[account_id] has
// the group set to "collaborator".
// If the merge field is set then we merge in the change; otherwise,
// we replace the value.

// IMPORTANT: this is a dangerous attack vector -- do not call this function
// with unsanitized input from a user!

export function jsonbSet(
  desc: object,
  merge: boolean = false
): { set: string; params: any[] } {
  const params: any[] = [];
  function pushParam(val: any, type: string): number {
    if (type.toUpperCase() == "JSONB") {
      val = JSON.stringify(val); // this is needed by the driver....}
    }
    params.push(val);
    return params.length;
  }

  function set(field: string, data: object, path: string[]): string {
    let obj = `COALESCE(${field}#>'{${path.join(",")}}', '{}'::JSONB)`;
    for (const key in data) {
      const val = data[key];
      if (val == null) {
        // remove key from object
        obj = `(${obj} - '${key}')`;
      } else {
        // set key in object
        if (merge && typeof val === "object" && !isDate(val)) {
          const subobj = set(field, val, path.concat([key]));
          obj = `JSONB_SET(${obj}, '{${key}}', ${subobj})`;
        } else {
          // completely replace field[key] with val.
          obj = `JSONB_SET(${obj}, '{${key}}', $${pushParam(
            val,
            "JSONB"
          )}::JSONB)`;
        }
      }
    }
    return obj;
  }

  const v: string[] = [];
  for (const field in desc) {
    const data = desc[field];
    v.push(`${field}=${set(field, data, [])}`);
  }
  return { set: v.join(","), params };
}
