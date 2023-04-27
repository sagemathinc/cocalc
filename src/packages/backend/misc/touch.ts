/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { open, utimes } from "node:fs/promises";

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
