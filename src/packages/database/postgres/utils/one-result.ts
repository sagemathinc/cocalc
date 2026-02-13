/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { map_without_undefined_and_null } from "@cocalc/util/misc";
import type { CB } from "@cocalc/util/types/database";

export type OneResultPattern = string | string[] | undefined;

type OneResultCallback<T = unknown> = CB<T>;

type CallbackError = Parameters<CB>[0];

interface OneResultInput {
  rows?: Array<Record<string, unknown>>;
}

/**
 * Returns a function that takes as input the output of doing a SQL query.
 * If there are no results, returns undefined.
 * If there is exactly one result, what is returned depends on pattern:
 *     'a_field' --> returns the value of this field in the result
 * If more than one result, an error.
 */
export function one_result(
  pattern?: OneResultPattern | OneResultCallback,
  cb?: OneResultCallback,
): (err?: CallbackError, result?: OneResultInput) => void {
  if (cb == null && typeof pattern === "function") {
    cb = pattern;
    pattern = undefined;
  }
  if (cb == null) {
    return () => {};
  }
  return (err, result) => {
    if (err) {
      cb(err);
      return;
    }
    if (result?.rows == null) {
      cb();
      return;
    }
    switch (result.rows.length) {
      case 0:
        cb();
        return;
      case 1: {
        const obj = map_without_undefined_and_null(
          result.rows[0] as Record<string, unknown>,
        ) as Record<string, unknown>;
        if (pattern == null) {
          cb(undefined, obj);
          return;
        }
        switch (typeof pattern) {
          case "string": {
            const value = obj[pattern];
            if (value == null) {
              cb();
              return;
            }
            const expire = obj.expire;
            if (expire != null && new Date() >= (expire as Date)) {
              cb();
              return;
            }
            cb(undefined, value);
            return;
          }
          case "object": {
            const picked: Record<string, unknown> = {};
            for (const key of pattern) {
              if (obj[key] != null) {
                picked[key] = obj[key];
              }
            }
            cb(undefined, picked);
            return;
          }
          default:
            cb(`BUG: unknown pattern -- ${pattern}`);
            return;
        }
      }
      default:
        cb("more than one result");
    }
  };
}
