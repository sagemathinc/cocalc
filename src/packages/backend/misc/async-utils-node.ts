/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { readFile, unlink, access } from "node:fs/promises";

export async function exists(path: string): Promise<boolean> {
  // fs.exists is deprecated
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export { readFile, unlink };
