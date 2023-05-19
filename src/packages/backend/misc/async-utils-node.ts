/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as fs from "fs";

import { callback } from "awaiting";

function _exists(path: string, cb: Function): void {
  fs.exists(path, (exists) => {
    cb(undefined, exists);
  });
}

export async function exists(path: string): Promise<boolean> {
  return await callback(_exists, path);
}

export async function readFile(path: string): Promise<Buffer> {
  return await callback(fs.readFile, path);
}

export async function unlink(path: string): Promise<void> {
  return await callback(fs.unlink, path);
}
