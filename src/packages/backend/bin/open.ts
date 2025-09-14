#!/usr/bin/env node
/**
 *  write an "open" event to $COCALC_CONTROL_DIR for the CoCalc spool server
 *
 * Requirements
 *   - Zero dependencies
 *   - Durable write: tmp -> fsync(file) -> rename -> fsync(dir)
 *   - Preserve shell view of CWD via $PWD
 *   - Map abs paths outside $HOME to "$HOME/.smc/root/..."
 *   - Create parents + touch missing files
 *   - Ignore non-expanded globs when path does not exist
 *   - Message schema: { event: "open", paths: [{ file|directory: string }] }
 */

import fs from "node:fs";
import fsp, { FileHandle } from "node:fs/promises";
import path from "node:path";

const MAX_FILES = 15 as const;
const ROOT_SYMLINK = ".smc/root" as const; // relative to $HOME

function usage(): void {
  console.error(`Usage: ${path.basename(process.argv[1])} [path names] ...`);
}

function hasGlobChars(p: string): boolean {
  return /[\*\?\{]/.test(p);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.lstat(p);
    return true;
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e && e.code === "ENOENT") return false;
    throw err;
  }
}

async function ensureParentsAndMaybeTouch(p: string): Promise<void> {
  const dir = path.dirname(p);
  try {
    await fsp.mkdir(dir, { recursive: true, mode: 0o755 });
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (!err || err.code !== "EEXIST") throw err;
  }
  if (!p.endsWith("/")) {
    try {
      const fh = await fsp.open(
        p,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
        0o644,
      );
      await fh.close();
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (!err || err.code !== "EEXIST") throw err;
    }
  }
}

function resolveAbsPreservePWD(p: string): string {
  if (path.isAbsolute(p)) return p;
  const pwd = process.env.PWD;
  if (pwd && path.isAbsolute(pwd)) return path.join(pwd, p);
  return path.resolve(p);
}

async function classifyPath(absPath: string): Promise<"file" | "directory"> {
  const st = await fsp.lstat(absPath);
  return st.isDirectory() ? "directory" : "file";
}

function mapToHomeView(absPath: string, home: string): string {
  const sep = path.sep;
  if (absPath.startsWith(home + sep)) {
    return absPath.slice(home.length + 1);
  }
  return path.join(ROOT_SYMLINK, absPath);
}

function hrtimeNs(): bigint {
  const [s, ns] = process.hrtime();
  return BigInt(s) * 1_000_000_000n + BigInt(ns);
}

function randomHex8(): string {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
}

async function fsyncDir(dirPath: string): Promise<void> {
  let fh: FileHandle | undefined;
  try {
    // O_DIRECTORY may not exist on some platforms; types allow number
    fh = await fsp.open(
      dirPath,
      fs.constants.O_RDONLY | (fs.constants as any).O_DIRECTORY,
    );
  } catch {
    try {
      fh = await fsp.open(dirPath, fs.constants.O_RDONLY);
    } catch {
      return;
    }
  }
  try {
    await fh.sync();
  } catch {
    // best-effort
  } finally {
    try {
      await fh.close();
    } catch {}
  }
}

interface PathMsgFile {
  file: string;
}
interface PathMsgDir {
  directory: string;
}

type PathMsg = PathMsgFile | PathMsgDir;

interface OpenMessage {
  event: "open";
  paths: PathMsg[];
}

async function writeDurable(
  dir: string,
  baseName: string,
  data: Buffer,
): Promise<void> {
  await fsp.mkdir(dir, { recursive: true, mode: 0o755 });
  const tmp = path.join(dir, "." + baseName + ".tmp");
  const dst = path.join(dir, baseName);

  const fh = await fsp.open(
    tmp,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
    0o600,
  );
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fsp.rename(tmp, dst);
  await fsyncDir(dir);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    usage();
    process.exit(1);
  }

  const home = process.env.HOME;
  if (!home) {
    console.error("HOME not set");
    process.exit(2);
  }

  const controlDir = process.env.COCALC_CONTROL_DIR;
  if (!controlDir) {
    console.error("COCALC_CONTROL_DIR not set");
    process.exit(2);
  }

  const trimmed = args.map((s) => s.trim()).filter(Boolean);
  let inputs = trimmed.slice(0, MAX_FILES);
  if (trimmed.length > MAX_FILES) {
    console.error(`You may open at most ${MAX_FILES} items; truncating.`);
  }

  const out: PathMsg[] = [];

  for (const p of inputs) {
    const exists = await pathExists(p);
    if (!exists && hasGlobChars(p)) {
      console.error(`no match for '${p}', so not creating`);
      continue;
    }
    if (!exists) {
      await ensureParentsAndMaybeTouch(p);
    }

    const abs = resolveAbsPreservePWD(p);
    const kind = await classifyPath(abs);
    const name = mapToHomeView(abs, home);
    if (kind === "directory") out.push({ directory: name });
    else out.push({ file: name });
  }

  if (out.length === 0) return;

  const message: OpenMessage = { event: "open", paths: out };
  const json = Buffer.from(JSON.stringify(message) + "\n", "utf8");
  const base = `${hrtimeNs()}-${process.pid}-${randomHex8()}.json`;

  try {
    await writeDurable(controlDir, base, json);
  } catch (e: unknown) {
    const err = e as Error;
    console.error(
      "failed to write control message:",
      err?.message ?? String(e),
    );
    process.exit(3);
  }
}

main().catch((e: unknown) => {
  const err = e as Error;
  console.error(err?.stack ?? err?.message ?? String(e));
  process.exit(1);
});
