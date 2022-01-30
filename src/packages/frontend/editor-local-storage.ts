/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { from_json, to_json } from "@cocalc/util/misc";
import {
  delete_local_storage_prefix,
  get_local_storage,
  set_local_storage,
  LS,
} from "./misc/local-storage";

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const SEP = "\uFE10";

function _local_storage_prefix(
  project_id: string,
  filename?: string,
  key?: string
): string {
  let s = project_id;
  if (filename != null) {
    s += filename + SEP;
  }
  if (key != null) {
    s += key;
  }
  return s;
}

//
// Set or get something about a project from local storage:
//
//    local_storage(project_id):  returns everything known about this project.
//    local_storage(project_id, filename):  get everything about given filename in project
//    local_storage(project_id, filename, key):  get value of key for given filename in project
//    local_storage(project_id, filename, key, value):   set value of key
//
// if localStorage is not supported in this browser, it uses a fallback.
//

export function local_storage_delete(
  project_id: string,
  filename?: string,
  key?: string
) {
  const prefix = _local_storage_prefix(project_id, filename, key);
  delete_local_storage_prefix(prefix);
}

export function local_storage(
  project_id: string,
  filename: string,
  key: string,
  value: string
) {
  const prefix = _local_storage_prefix(project_id, filename, key);
  const n = prefix.length;
  if (filename != null) {
    if (key != null) {
      if (value != null) {
        set_local_storage(prefix, to_json(value));
      } else {
        const x = get_local_storage(prefix);
        if (x == null) {
          return x;
        } else {
          if (typeof x === "string") {
            return from_json(x);
          } else {
            return x;
          }
        }
      }
    } else {
      // Everything about a given filename
      const obj: any = {};
      for (const [k, v] of LS) {
        if (k.slice(0, n) === prefix) {
          obj[k.split(SEP)[1]] = v;
        }
      }
      return obj;
    }
  } else {
    // Everything about project
    const obj: any = {};
    for (const [k, v] of LS) {
      if (k.slice(0, n) === prefix) {
        const x = k.slice(n);
        const [filename, key] = x.split(SEP);
        if (obj[filename] == null) {
          obj[filename] = {};
        }
        obj[filename][key] = v;
      }
    }
    return obj;
  }
}
