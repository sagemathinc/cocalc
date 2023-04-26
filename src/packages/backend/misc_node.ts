//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################

import { utimes, open } from "node:fs/promises";

import enable_mesg from "./tcp/enable-messaging-protocol";
export { enable_mesg };
export { sha1, uuidsha1 } from "./sha1";
import abspath from "./misc/abspath";
export { abspath };
export { execute_code } from "./execute-code";

// touch the file in a similar manner as "touch" in linux
export async function touch(path: string): Promise<boolean> {
  try {
    const now = new Date();
    await utimes(path, now, now);
    const fd = await open(path, "w");
    await fd.close();
    return true;
  } catch (e) {
    return false;
  }
}
