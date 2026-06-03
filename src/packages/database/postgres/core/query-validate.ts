/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Query Engine - Validation

TypeScript implementation of _validate_opts method for validating
UUID and project group fields in query options.

Based on postgres-base.coffee lines 814-831
*/

import type { PostgreSQL } from "../types";
import { is_valid_uuid_string, PROJECT_GROUPS } from "@cocalc/util/misc";

/**
 * Validate query options for UUIDs and project groups
 *
 * Validates:
 * - Fields ending in 'id' must be valid UUIDs (or null/undefined)
 * - Fields ending in 'ids' must be arrays of valid UUIDs
 * - opts.group must be a valid PROJECT_GROUP
 * - opts.groups must be an array of valid PROJECT_GROUPS
 *
 * @param db - PostgreSQL database instance
 * @param opts - Options object to validate (must include cb callback)
 * @returns true if validation passes, false if validation fails (and calls cb with error)
 */
export function validateOpts(_db: PostgreSQL, opts: any): boolean {
  for (const [k, v] of Object.entries(opts)) {
    // Check fields ending in 'id' for valid UUID
    if (k.endsWith("id")) {
      if (v != null && !is_valid_uuid_string(v as string)) {
        opts.cb?.(`invalid ${k} -- ${v}`);
        return false;
      }
    }

    // Check fields ending in 'ids' for array of valid UUIDs
    if (k.endsWith("ids")) {
      const ids = v as any[];
      for (const uuid of ids) {
        if (!is_valid_uuid_string(uuid)) {
          opts.cb?.(`invalid uuid ${uuid} in ${k} -- ${JSON.stringify(v)}`);
          return false;
        }
      }
    }

    // Check 'group' field for valid PROJECT_GROUP
    if (k === "group" && !PROJECT_GROUPS.includes(v as string)) {
      opts.cb?.(`unknown project group '${v}'`);
      return false;
    }

    // Check 'groups' field for array of valid PROJECT_GROUPS
    if (k === "groups") {
      const groups = v as any[];
      for (const group of groups) {
        if (!PROJECT_GROUPS.includes(group)) {
          opts.cb?.(`unknown project group '${group}' in groups`);
          return false;
        }
      }
    }
  }

  return true;
}
