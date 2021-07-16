import { promisify } from "util";
import { join } from "path";
import { spawn } from "child_process";
import { mkdir as fs_mkdir, rm, readFile as fs_readFile } from "fs";
import { root } from "smc-util-node/data";
import getLogger from "smc-hub/logger";
import { ProjectState, ProjectStatus } from "./base";

const winston = getLogger("project-control:util");

export const mkdir = promisify(fs_mkdir);
const readFile = promisify(fs_readFile);

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

function pidFile(HOME: string): string {
  return join(dataPath(HOME), "project.pid");
}

// throws error if no such file
export async function getProjectPID(HOME: string): Promise<number> {
  return parseInt((await readFile(pidFile(HOME))).toString());
}

export async function isProjectRunning(HOME: string): Promise<boolean> {
  try {
    return pidIsRunning(await getProjectPID(HOME));
  } catch (_err) {
    // err would happen if file doesn't exist, which means nothing to do.
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

export async function getState(HOME: string, _opts?): Promise<ProjectState> {
  winston.debug(`getState("${HOME}")`);
  try {
    return {
      state: isProjectRunning(HOME) ? "running" : "opened",
      time: new Date(),
    };
  } catch (err) {
    return {
      error: `${err}`,
      time: new Date(),
      state: "opened",
    };
  }
}

export async function getStatus(HOME: string): Promise<ProjectStatus> {
  winston.debug(`getStatus("${HOME}")`);
  const data = dataPath(HOME);
  const status: ProjectStatus = {};
  for (const path of [
    "project.pid",
    "hub-server.port",
    "browser-server.port",
    "sage_server.port",
    "sage_server.pid",
    "secret_token",
  ]) {
    try {
      const val = (await readFile(join(data, path))).toString().trim();
      if (path.endsWith(".pid")) {
        const pid = parseInt(val);
        if (pidIsRunning(pid)) {
          status[path] = pid;
        }
      } else if (path.endsWith(".port")) {
        status[path] = parseInt(val);
      } else {
        status[path] = val;
      }
    } catch (_err) {
      //winston.debug(`getStatus: ${_err}`);
    }
  }
  status.state = status["project.pid"] ? "running" : "opened";
  return status;
}
