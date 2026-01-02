/*
 *  This file is part of CoCalc: Copyright (c) 2026 Sagemath, Inc.
 *  License: MS-RSL - see LICENSE.md for details
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { getLogger } from "@cocalc/backend/logger";
import { PGlite } from "@electric-sql/pglite";

const L = getLogger("db:pglite");

export type PgliteOptions = {
  dataDir?: string;
};

let instance: PGlite | undefined;

function resolveDataDir(dataDir?: string): string {
  const env = process.env.COCALC_PGLITE_DATA_DIR;
  const resolved = dataDir ?? env ?? "memory://";
  if (!resolved.startsWith("memory://")) {
    const dir = path.resolve(resolved);
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  return resolved;
}

export async function getPglite(
  options: PgliteOptions = {},
): Promise<PGlite> {
  if (instance != null) {
    return instance;
  }
  const dataDir = resolveDataDir(options.dataDir);
  L.info(`initializing PGlite (dataDir=${dataDir})`);
  const pg = new PGlite(dataDir);
  instance = pg;
  return pg;
}

export async function closePglite(): Promise<void> {
  if (instance == null) {
    return;
  }
  await instance.close();
  instance = undefined;
}

export function getPgliteDataDir(): string {
  return resolveDataDir();
}
