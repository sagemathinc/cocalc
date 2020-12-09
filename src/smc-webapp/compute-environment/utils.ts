/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// utilities


export const NAME = "compute-environment";

export function full_lang_name(lang: string): string {
  switch (lang) {
    case "R":
      return "R Project";
      break;
  }
  return lang.charAt(0).toUpperCase() + lang.slice(1);
}

export function by_lowercase(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}
