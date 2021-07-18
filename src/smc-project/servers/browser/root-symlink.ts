/*
Create the root symbolic link, so that it is possible to
browse the entire filesystem, including tmp.
*/

import { access, constants, symlink } from "fs";
import { callback } from "awaiting";
import { rootSymlink } from "smc-project/data";

export default async function init(): Promise<void> {
  try {
    // not using fs.exists, since it is DEPRECATED.
    await callback(access, rootSymlink, constants.F_OK);
    // exists so nothing to do.
  } catch (_err) {
    // doesn't exist, so create it
    await callback(symlink, "/", rootSymlink);
  }
}
