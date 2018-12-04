
// Well-defined JSON.stringify...
import json_stable from "json-stable-stringify";
import * as immutable from "immutable";

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

