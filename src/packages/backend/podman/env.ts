import { accessSync, constants, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function isUsableDir(dir: string): boolean {
  try {
    const stat = statSync(dir);
    if (!stat.isDirectory()) return false;
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    return false;
  }
  return isUsableDir(dir);
}

export function podmanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const configured = env.COCALC_PODMAN_RUNTIME_DIR || env.XDG_RUNTIME_DIR;
  // Podman (especially with crun) expects XDG_RUNTIME_DIR to exist and be writable.
  // On fresh boot, /run/user/<uid> only appears after a user login session, so we
  // fall back to a writable tmpdir to avoid sporadic "permission denied" failures.
  let runtimeDir = configured && isUsableDir(configured) ? configured : undefined;
  if (!runtimeDir) {
    const fallback = join(tmpdir(), `cocalc-podman-runtime-${uid ?? "unknown"}`);
    if (ensureDir(fallback)) {
      runtimeDir = fallback;
    }
  }
  if (runtimeDir) {
    env.XDG_RUNTIME_DIR = runtimeDir;
  }
  if (!env.CONTAINERS_CGROUP_MANAGER) {
    env.CONTAINERS_CGROUP_MANAGER = "cgroupfs";
  }
  return env;
}
