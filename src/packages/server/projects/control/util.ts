import { join } from "path";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import getLogger from "@cocalc/backend/logger";
import { ProjectState, ProjectStatus } from "./base";
import { getProject } from ".";
import { pidFilename } from "@cocalc/util/project-info";
import { executeCode } from "@cocalc/backend/execute-code";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
const logger = getLogger("project-control:util");

export function dataPath(HOME: string): string {
  return join(HOME, ".smc");
}

export async function homePath(project_id: string): Promise<string> {
  throw Error(
    `DEPRECATED: homePath isn't located on this server ${project_id}`,
  );
}

export function getUsername(_project_id: string): string {
  return "user";
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
  return join(dataPath(HOME), pidFilename);
}

function parseDarwinTime(output: string): number {
  // output = '{ sec = 1747866131, usec = 180679 } Wed May 21 15:22:11 2025';
  const match = output.match(/sec\s*=\s*(\d+)/);

  if (match) {
    const sec = parseInt(match[1], 10);
    return sec * 1000;
  } else {
    throw new Error("Could not parse sysctl output");
  }
}

let _bootTime = 0;
export async function bootTime(): Promise<number> {
  if (!_bootTime) {
    if (process.platform === "darwin") {
      // uptime isn't available on macos.
      const { stdout } = await executeCode({
        command: "sysctl",
        args: ["-n", "kern.boottime"],
      });
      _bootTime = parseDarwinTime(stdout);
    } else {
      const { stdout } = await executeCode({ command: "uptime", args: ["-s"] });
      _bootTime = new Date(stdout).valueOf();
    }
  }
  return _bootTime;
}

// throws error if no such file
export async function getProjectPID(HOME: string): Promise<number> {
  const path = pidFile(HOME);
  // if path was created **before OS booted**, throw an error
  const stats = await stat(path);
  const modificationTime = stats.mtime.getTime();
  if (modificationTime <= (await bootTime())) {
    throw new Error(
      `The pid file "${path}" is too old -- considering project to be dead`,
    );
  }

  return parseInt((await readFile(path)).toString());
}

export async function setupDataPath(HOME: string): Promise<void> {
  const data = dataPath(HOME);
  logger.debug(`setup "${data}"...`);
  await rm(data, { recursive: true, force: true });
  await mkdir(data);
}

// see also packages/project/secret-token.ts
export function secretTokenPath(HOME: string) {
  const data = dataPath(HOME);
  return join(data, "secret-token");
}

export async function writeSecretToken(
  HOME: string,
  secretToken: string,
): Promise<void> {
  const path = secretTokenPath(HOME);
  await ensureContainingDirectoryExists(path);
  await writeFile(path, secretToken);
}

export async function getState(HOME: string): Promise<ProjectState> {
  throw Error("getState: deprecated -- redo using conat!");
  // [ ] TODO: deprecate
  logger.debug(`getState("${HOME}"): DEPRECATED`);
  return {
    ip: "127.0.0.1",
    state: "running",
    time: new Date(),
  };
}

export async function getStatus(HOME: string): Promise<ProjectStatus> {
  logger.debug(`getStatus("${HOME}")`);
  const data = dataPath(HOME);
  const status: ProjectStatus = {};
  for (const path of [
    "project.pid",
    "hub-server.port",
    "browser-server.port",
    "sage_server.port",
    "sage_server.pid",
    "start-timestamp.txt",
    "session-id.txt",
  ]) {
    try {
      const val = (await readFile(join(data, path))).toString().trim();
      if (path.endsWith(".pid")) {
        const pid = parseInt(val);
        if (pidIsRunning(pid)) {
          status[path] = pid;
        }
      } else if (path == "start-timestamp.txt") {
        status.start_ts = parseInt(val);
      } else if (path == "session-id.txt") {
        status.session_id = val;
      } else if (path.endsWith(".port")) {
        status[path] = parseInt(val);
      } else {
        status[path] = val;
      }
    } catch (_err) {
      //logger.debug(`getStatus: ${_err}`);
    }
  }
  return status;
}

export async function restartProjectIfRunning(project_id: string) {
  // If necessary, restart project to ensure that updated settings apply.
  // This is not bullet proof in all cases, e.g., for a newly created project.
  const project = getProject(project_id);
  const { state } = await project.state();
  if (state == "starting" || state == "running") {
    await project.restart();
  }
}
