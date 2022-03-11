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

import { realpath } from "fs/promises";
import { resolve } from "path";

export async function canonical_paths(paths: string[]): Promise<string[]> {
  const v: string[] = [];

  const { HOME: HOME_ENV } = process.env;
  if (HOME_ENV == null) {
    throw Error("HOME environment variable must be defined");
  }

  // realpath is necessary, because in some circumstances the home dir is made up of a symlink
  const HOME = await realpath(HOME_ENV);

  for (let path of paths) {
    path = await realpath(resolve(path));
    if (path.startsWith(HOME)) {
      v.push(path.slice(HOME.length + 1));
    } else {
      v.push(HOME + "/.smc/root" + path);
    }
  }

  return v;
}
