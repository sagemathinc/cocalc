import fs from "fs";

import { callback } from "awaiting";

function _exists(path: string, cb: Function): void {
  fs.exists(path, exists => {
    cb(undefined, exists);
  });
}

export async function exists(path: string): Promise<bool> {
  return await callback(_exists)(path);
}

export async function readFile(path: string): Promise<Buffer> {
  return await callback(fs.readFile)(path);
}
