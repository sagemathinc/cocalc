/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Return a normalized version of the path, which is always
   relative to the user's home directory.

   If the path is not in the user's home directory, we use
   the symlink form ~/.smc/root to / to make it appear to
   be in the home directory.
*/

import { resolve } from "path";

export function canonical_paths(paths: string[]): string[] {
  const v: string[] = [];
  for (let path of paths) {
    path = resolve(path);
    const { HOME } = process.env;
    if (HOME == null) {
      throw Error("HOME environment variable must be defined");
    }
    if (path.startsWith(HOME)) {
      v.push(path.slice(HOME.length + 1));
    } else {
      v.push(HOME + "/.smc/root" + path);
    }
  }
  return v;
}
