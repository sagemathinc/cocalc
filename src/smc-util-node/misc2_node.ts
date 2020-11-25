/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { contains_url, re_url, to_human_list } from "../smc-util/misc";

// returns undefined if ok, otherwise an error message
export function is_valid_username(str: string): string | undefined {
  const name = str.toLowerCase();

  const found = name.match(re_url);
  if (found) {
    return `URLs are not allowed. Found ${to_human_list(found)}`;
  }

  if (name.indexOf("mailto:") != -1 && name.indexOf("@") != -1) {
    return "email addresses are not allowed";
  }

  return;
}

// integer from process environment variable, with fallback
export function process_env_int(name: string, fallback: number): number {
  const val = process.env[name];
  if (val == null) return fallback;
  try {
    return parseInt(val);
  } catch {
    return fallback;
  }
}
