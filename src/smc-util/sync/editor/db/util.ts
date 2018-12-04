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
