/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  is_valid_uuid_string,
  to_json,
  PROJECT_GROUPS,
} from "@cocalc/util/misc";

/**
 * Validates options for database operations.
 * Returns true if validation passes, false otherwise.
 * If validation fails, throws an error with description.
 */
export function validateOpts(opts: any): boolean {
  for (const k in opts) {
    const v = opts[k];

    // Validate lti_id (must be non-empty array of non-empty strings)
    if (k === "lti_id") {
      if (v == null) {
        continue;
      }
      if (!Array.isArray(v) || v.length === 0) {
        throw new Error(`invalid ${k} -- can't be an empty array`);
      }
      for (const x of v) {
        if (typeof x !== "string" || x.length === 0) {
          throw new Error(`invalid ${k} -- ${v}`);
        }
      }
    }
    // Validate any field ending in "id" (must be valid UUID)
    else if (k.slice(k.length - 2) === "id") {
      if (v != null && !is_valid_uuid_string(v)) {
        throw new Error(`invalid ${k} -- ${v}`);
      }
    }

    // Validate any field ending in "ids" (must be array of valid UUIDs)
    if (k.slice(k.length - 3) === "ids") {
      for (const w of v) {
        if (!is_valid_uuid_string(w)) {
          throw new Error(`invalid uuid ${w} in ${k} -- ${to_json(v)}`);
        }
      }
    }

    // Validate "group" field (must be valid PROJECT_GROUP)
    if (k === "group" && !PROJECT_GROUPS.includes(v)) {
      throw new Error(`unknown project group '${v}'`);
    }

    // Validate "groups" field (must be array of valid PROJECT_GROUPS)
    if (k === "groups") {
      for (const w of v) {
        if (!PROJECT_GROUPS.includes(w)) {
          throw new Error(`unknown project group '${w}' in groups`);
        }
      }
    }
  }

  return true;
}
