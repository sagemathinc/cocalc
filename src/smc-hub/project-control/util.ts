import { promisify } from "util";
import { join } from "path";
import { spawn } from "child_process";
import { mkdir as fs_mkdir, rm, readFile } from "fs";
import { root } from "smc-util-node/data";
import getLogger from "smc-hub/logger";

const winston = getLogger("project-control:util");

export const mkdir = promisify(fs_mkdir);

export function dataPath(HOME: string): string {
  return join(HOME, ".smc");
}

function pidIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_err) {
    return false;
  }
}

export async function isProjectRunning(HOME: string): Promise<boolean> {
  const data = dataPath(HOME);
  const pidFile = join(data, "project.pid");
  try {
    const pid = parseInt((await promisify(readFile)(pidFile)).toString());
    return pidIsRunning(pid);
  } catch (_err) {
    // err would happen if file doesn't exist, which means nothing
    // to do.
    return false;
  }
}

export async function setupDataPath(HOME: string): Promise<void> {
  const data = dataPath(HOME);
  winston.debug(`setup "${data}"...`);
  await promisify(rm)(data, { recursive: true, force: true });
  await mkdir(data);
}

export async function launchProjectDaemon(env): Promise<void> {
  winston.debug(`launching project daemon at "${env.HOME}"...`);
  await spawn("npx", ["cocalc-project", "--daemon"], {
    env,
    cwd: join(root, "smc-project"),
  });
}

export function sanitizedEnv(env: { [key: string]: string | undefined }): {
  [key: string]: string;
} {
  const env2 = { ...env };
  // Remove some potentially confusing env variables
  for (const key of [
    "PGDATA",
    "PGHOST",
    "NODE_ENV",
    "NODE_OPTIONS",
    "BASE_PATH",
    "PORT",
    "DATA",
  ]) {
    delete env2[key];
  }
  for (const key in env2) {
    if (key.startsWith("COCALC_") || env2[key] == null) {
      delete env2[key];
    }
  }
  return env2 as { [key: string]: string };
}
