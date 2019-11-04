/* Return a normalized version of the path, which is always
   relative to the user's home directory.

   If the path is not in the user's home directory, we use
   the symlink form ~/.smc/root to / to make it appear to
   be in the home directory.
*/

import { resolve } from "path";

export function canonical_path(path: string): string {
  path = resolve(path);
  const { HOME } = process.env;
  if (HOME == null) {
    throw Error("HOME environment variable must be defined");
  }
  if (path.startsWith(HOME)) {
    return path.slice(HOME.length + 1);
  } else {
    return HOME + "/.smc/root" + path;
  }
}
