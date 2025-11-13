/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { open, utimes } from "node:fs/promises";

// touch the file in a similar manner as "touch" in linux
export async function touch(
  path: string,
  createIfMissing = true
): Promise<boolean> {
  try {
    const now = new Date();
    await utimes(path, now, now);
    return true;
  } catch (err) {
    try {
      if (createIfMissing && "ENOENT" === err.code) {
        const fd = await open(path, "a");
        await fd.close();
        return true;
      }
    } finally {
      return false;
    }
  }
}
