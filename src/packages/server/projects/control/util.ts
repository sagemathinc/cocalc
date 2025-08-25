import { join } from "path";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import { root } from "@cocalc/backend/data";
import { callback2 } from "@cocalc/util/async-utils";
import getLogger from "@cocalc/backend/logger";
import { ProjectState, ProjectStatus } from "./base";
import base_path from "@cocalc/backend/base-path";
import { db } from "@cocalc/database";
import { getProject } from ".";
import { conatServer } from "@cocalc/backend/data";
import { pidFilename } from "@cocalc/util/project-info";
import { executeCode } from "@cocalc/backend/execute-code";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import {
  client as fileserverClient,
  type Fileserver,
} from "@cocalc/server/conat/file-server";
const logger = getLogger("project-control:util");

export function dataPath(HOME: string): string {
  return join(HOME, ".smc");
}

let fsclient: Fileserver | null = null;
export async function homePath(project_id: string): Promise<string> {
  fsclient ??= fileserverClient();
  const { path } = await fsclient.mount({ project_id });
  return path;
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

const ENV_VARS_DELETE = [
  "PGDATA",
  "PGHOST",
  "PGUSER",
  "PGDATABASE",
  "PROJECTS",
  "BASE_PATH",
  "PORT",
  "DATA",
  "LOGS",
  "PWD",
  "LINES",
  "COLUMNS",
  "LS_COLORS",
  "INIT_CWD",
  "DEBUG_FILE",
  "SECRETS",
] as const;

export function sanitizedEnv(env: { [key: string]: string | undefined }): {
  [key: string]: string;
} {
  const env2 = { ...env };
  // Remove some potentially confusing env variables
  for (const key of ENV_VARS_DELETE) {
    delete env2[key];
  }
  // Comment about stripping things starting with /root:
  // These tend to creep in as npm changes, e.g., 'npm_config_userconfig' is
  // suddenly /root/.npmrc, and due to permissions this will break starting
  // projects with a mysterious "exit code 243" and no further info, which
  // is really hard to track down.
  for (const key in env2) {
    if (
      key.startsWith("npm_") ||
      key.startsWith("COCALC_") ||
      key.startsWith("CONAT_") ||
      key.startsWith("PNPM_") ||
      key.startsWith("__NEXT") ||
      key.startsWith("NODE_") ||
      env2[key]?.startsWith("/root") ||
      env2[key] == null
    ) {
      delete env2[key];
    }
  }
  return env2 as { [key: string]: string };
}

export async function getEnvironment(
  project_id: string,
  { HOME = "/home/user" }: { HOME?: string } = {},
): Promise<{ [key: string]: any }> {
  const extra: { [key: string]: any } = await callback2(
    db().get_project_extra_env,
    { project_id },
  );
  const extra_env: string = Buffer.from(JSON.stringify(extra ?? {})).toString(
    "base64",
  );

  const USER = getUsername(project_id);
  const DATA = dataPath(HOME);

  return {
    ...sanitizedEnv(process.env),
    ...{
      HOME,
      BASE_PATH: base_path,
      DATA,
      LOGS: DATA,
      DEBUG: "cocalc:*,-cocalc:silly:*", // so interesting stuff gets logged, but not too much unless we really need it.
      // important to reset the COCALC_ vars since server env has own in a project
      COCALC_PROJECT_ID: project_id,
      COCALC_USERNAME: USER,
      USER,
      COCALC_EXTRA_ENV: extra_env,
      PATH: `${HOME}/bin:${HOME}/.local/bin:${process.env.PATH}`,
      CONAT_SERVER: conatServer,
      COCALC_SECRET_TOKEN: secretTokenPath(HOME),
    },
  };
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

export async function ensureConfFilesExists(
  HOME: string,
): Promise<void> {
  for (const path of ["bashrc", "bash_profile"]) {
    const target = join(HOME, `.${path}`);
    try {
      await stat(target);
    } catch (_) {
      // file does NOT exist, so create
      const source = join(
        root,
        "smc_pyutil/smc_pyutil/templates",
        process.platform,
        path,
      );
      try {
        await copyFile(source, target);
      } catch (err) {
        logger.error(`ensureConfFilesExists -- ${err}`);
      }
    }
  }
}

export async function restartProjectIfRunning(project_id: string) {
  // If necessary, restart project to ensure that license gets applied.
  // This is not bullet proof in all cases, e.g., for a newly created project,
  // and it is better to apply the license when creating the project if possible.
  const project = getProject(project_id);
  const { state } = await project.state();
  if (state == "starting" || state == "running") {
    await project.restart();
  }
}
