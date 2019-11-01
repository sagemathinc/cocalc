// Well-defined JSON.stringify...
const json_stable = require("json-stable-stringify");
import * as immutable from "immutable";
import { isEqual } from "underscore";

export function to_key(s: any): string {
  if (immutable.Map.isMap(s)) {
    s = s.toJS();
  }
  // NOTE: s is not undefined.
  return json_stable(s) as string;
}

/* TODO/worry: I change to json_stable from misc.to_json
   and misc.from_json, so the string is canonical.  However,
   Date objects will be treated differently.   This is fine
   by me, in that probably we should just ensure no date
   objects are ever used with db-doc... or have a special
   column type (like string_cols) for them.
   I think right now all our applications (e.g., task lists, jupyter)
   just use ms since epoch explicitly.
*/

export function to_str(obj: any[]): string {
  const v = obj.map(x => json_stable(x));
  /* NOTE: It is *VERY* important to sort v!  Otherwise, the hash
     of this document, which is used by
     syncstring, isn't stable in terms of the value of the
     document.  This can in theory
     cause massive trouble with file saves, e.g., of jupyter
     notebooks, courses, etc. (They save fine, but
     they appear not to for the user...).
   */
  v.sort();
  return v.join("\n");
}

// Create an object change such that merge_set(obj1, change) produces obj2.
// Thus for each key, value1 of obj1 and key, value2 of obj2:
//  If value1 is the same as value2, do nothing.
//  If value1 exists but value2 does not, do change[key] = null
//  If value2 exists but value1 does not, do change[key] = value2
export function map_merge_patch(obj1, obj2) {
  let val2;
  const change = {};
  for (var key in obj1) {
    const val1 = obj1[key];
    val2 = obj2[key];
    if (isEqual(val1, val2)) {
      // nothing to do
    } else if (val2 == null) {
      change[key] = null;
    } else {
      change[key] = val2;
    }
  }
  for (key in obj2) {
    val2 = obj2[key];
    if (obj1[key] != null) {
      continue;
    }
    change[key] = val2;
  }
  return change;
}

// obj and change are both immutable.js Maps.  Do the following:
//  - for each value of change that is null or undefined, we delete that key from obj
//  - we set the other vals of obj, accordingly.
// So this is a shallow merge with the ability to *delete* keys.
export function merge_set(
  obj: immutable.Map<any, any>,
  change: immutable.Map<any, any>
): immutable.Map<any, any> {
  change.forEach(function(v, k) {
    if (v === null || v == null) {
      obj = obj.delete(k);
    } else {
      obj = obj.set(k, v);
    }
  });
  return obj;
}

export function nonnull_cols(
  f: immutable.Map<any, any>
): immutable.Map<any, any> {
  // Yes, "!==" not "!=" below!
  return immutable.Map(f.filter((v, _) => v !== null));
}
