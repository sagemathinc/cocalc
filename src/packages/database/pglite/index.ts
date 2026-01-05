/*
 *  This file is part of CoCalc: Copyright (c) 2026 Sagemath, Inc.
 *  License: MS-RSL - see LICENSE.md for details
 */

import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { root } from "@cocalc/backend/data";
import { getLogger } from "@cocalc/backend/logger";
import { PGlite } from "@electric-sql/pglite";

const L = getLogger("db:pglite");

export type PgliteOptions = {
  dataDir?: string;
};

let instance: PGlite | undefined;
type PgliteBundle = { fsBundle?: Blob; wasmModule?: unknown };

let bundlePromise: Promise<PgliteBundle> | undefined;

async function loadPgliteBundle(): Promise<PgliteBundle> {
  if (!process.versions?.node) {
    return {};
  }
  if (!bundlePromise) {
    bundlePromise = (async () => {
      try {
        const distDir = resolvePgliteDistDir();
        if (!distDir) {
          throw new Error("unable to locate pglite dist directory");
        }
        const [data, wasm] = await Promise.all([
          readFile(path.join(distDir, "pglite.data")),
          readFile(path.join(distDir, "pglite.wasm")),
        ]);
        const BlobCtor = globalThis.Blob ?? require("buffer").Blob;
        const fsBundle = new BlobCtor([data]);
        const wasmModule = await (globalThis as any).WebAssembly?.compile?.(
          wasm,
        );
        return { fsBundle, wasmModule };
      } catch (err) {
        L.warn("failed to load pglite bundle assets", err);
        return {};
      }
    })();
  }
  return await bundlePromise;
}

function resolvePgliteDistDir(): string | undefined {
  const envDir = process.env.COCALC_PGLITE_BUNDLE_DIR;
  const candidates: string[] = [];
  if (envDir) {
    candidates.push(envDir);
  }
  try {
    const resolved = require.resolve("@electric-sql/pglite");
    candidates.push(path.dirname(resolved));
  } catch {}
  candidates.push(
    path.join(
      root,
      "packages",
      "database",
      "node_modules",
      "@electric-sql",
      "pglite",
      "dist",
    ),
    path.join(
      root,
      "packages",
      "node_modules",
      "@electric-sql",
      "pglite",
      "dist",
    ),
  );
  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, "pglite.data")) &&
      existsSync(path.join(candidate, "pglite.wasm"))
    ) {
      return candidate;
    }
  }
  return undefined;
}

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

export async function getPglite(options: PgliteOptions = {}): Promise<PGlite> {
  if (instance != null) {
    return instance;
  }
  const dataDir = resolveDataDir(options.dataDir);
  L.info(`initializing PGlite (dataDir=${dataDir})`);
  const bundle = await loadPgliteBundle();
  const pg = new PGlite({
    dataDir,
    ...bundle,
    parsers: {
      // Match pg's default behavior of returning int8 as strings.
      20: (value: string) => value,
      // Match pg's default bytea parsing (Buffer).
      17: (value: string) => Buffer.from(value.slice(2), "hex"),
      // Match pg's UTC interpretation for timestamp without timezone.
      1114: (value: string) => new Date(`${value.replace(" ", "T")}Z`),
    },
  } as any);
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
