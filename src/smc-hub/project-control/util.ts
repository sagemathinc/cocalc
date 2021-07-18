import { promisify } from "util";
import { join, resolve } from "path";
import { exec as exec0, spawn } from "child_process";
import * as fs from "fs";

import { projects, root } from "smc-util-node/data";
import { is_valid_uuid_string } from "smc-util/misc";
import { callback2 } from "smc-util/async-utils";
import getLogger from "smc-hub/logger";
import { CopyOptions, ProjectState, ProjectStatus } from "./base";
import { getUid } from "smc-util-node/misc";
import base_path from "smc-util-node/base-path";
import { database } from "smc-hub/servers/database";

const winston = getLogger("project-control:util");

export const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const copyFile = promisify(fs.copyFile);
const rm = promisify(fs.rm);

export async function chown(path: string, uid: number): Promise<void> {
  await promisify(fs.chown)(path, uid, uid);
}

export function dataPath(HOME: string): string {
  return join(HOME, ".smc");
}

export function homePath(project_id: string): string {
  return join(projects, project_id);
}

export function getUsername(project_id: string): string {
  return project_id.split("-").join("");
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
    const pid = await getProjectPID(HOME);
    //winston.debug(`isProjectRunning(HOME="${HOME}") -- pid=${pid}`);
    return pidIsRunning(pid);
  } catch (err) {
    //winston.debug(`isProjectRunning(HOME="${HOME}") -- no pid ${err}`);
    // err would happen if file doesn't exist, which means nothing to do.
    return false;
  }
}

export async function setupDataPath(HOME: string, uid?: number): Promise<void> {
  const data = dataPath(HOME);
  winston.debug(`setup "${data}"...`);
  await rm(data, { recursive: true, force: true });
  await mkdir(data);
  if (uid != null) {
    await chown(data, uid);
  }
}

export async function launchProjectDaemon(env, uid?: number): Promise<void> {
  winston.debug(`launching project daemon at "${env.HOME}"...`);
  await promisify((cb: Function) => {
    const child = spawn("npx", ["cocalc-project", "--daemon"], {
      env,
      cwd: join(root, "smc-project"),
      uid,
      gid: uid,
    });
    child.on("error", (err) => {
      cb(err);
    });
    child.on("exit", (code) => {
      cb(code);
    });
  })();
}

async function exec(
  command: string,
  verbose?: boolean
): Promise<{ stdout: string; stderr: string }> {
  winston.debug(`exec '${command}'`);
  const output = await promisify(exec0)(command);
  if (verbose) {
    winston.debug(`output: ${JSON.stringify(output)}`);
  }
  return output;
}

export async function createUser(project_id: string): Promise<void> {
  const username = getUsername(project_id);
  try {
    await exec(`/usr/sbin/userdel ${username}`); // this also deletes the group
  } catch (_) {
    // it's fine -- we delete just in case it is left over.
  }
  const uid = `${getUid(project_id)}`;
  winston.debug("createUser: adding group");
  await exec(`/usr/sbin/groupadd -g ${uid} -o ${username}`, true);
  winston.debug("createUser: adding user");
  await exec(
    `/usr/sbin/useradd -u ${uid} -g ${uid} -o ${username} -d ${homePath(
      project_id
    )} -s /bin/bash`,
    true
  );
}

export async function deleteUser(project_id: string): Promise<void> {
  const username = getUsername(project_id);
  const uid = `${getUid(project_id)}`;
  await exec(`pkill -9 -u ${uid}`);
  try {
    await exec(`/usr/sbin/userdel ${username}`); // this also deletes the group
  } catch (_) {
    // not error if not there...
  }
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

export async function getEnvironment(
  project_id: string
): Promise<{ [key: string]: any }> {
  const extra: { [key: string]: any } = await callback2(
    database.get_project_extra_env,
    { project_id }
  );
  const extra_env: string = Buffer.from(JSON.stringify(extra ?? {})).toString(
    "base64"
  );

  const USER = getUsername(project_id);
  const HOME = homePath(project_id);

  return {
    ...sanitizedEnv(process.env),
    ...{
      HOME,
      BASE_PATH: base_path,
      DATA: dataPath(HOME),
      // important to reset the COCALC_ vars since server env has own in a project
      COCALC_PROJECT_ID: project_id,
      COCALC_USERNAME: USER,
      USER,
      COCALC_EXTRA_ENV: extra_env,
      PATH: `${HOME}/bin:${HOME}/.local/bin:${process.env.PATH}`,
    },
  };
}

export async function getState(HOME: string): Promise<ProjectState> {
  winston.debug(`getState("${HOME}")`);
  try {
    return {
      state: (await isProjectRunning(HOME)) ? "running" : "opened",
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
  if (!(await isProjectRunning(HOME))) {
    return status;
  }
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
  return status;
}

export async function ensureConfFilesExists(
  HOME: string,
  uid?: number
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
        path
      );
      try {
        await copyFile(source, target);
        if (uid != null) {
          await chown(target, uid);
        }
      } catch (err) {
        winston.error(`ensureConfFilesExists -- ${err}`);
      }
    }
  }
}

// Copy a path using rsync and the specified options
// on the local filesystem. (TODO) When running as root,
// we can also specify the user to change the target
// ownership of the files to.
// NOTE: the wait_until_done and scheduled CopyOptions
// are not implemented at all here.
export async function copyPath(
  opts: CopyOptions,
  project_id: string,
  target_uid?: number
): Promise<void> {
  winston.info(
    `copyPath(target="${project_id}"): opts=${JSON.stringify(opts)}`
  );
  const { path, overwrite_newer, delete_missing, backup, timeout, bwlimit } =
    opts;
  if (path == null) {
    // typescript already enforces this...
    throw Error("path must be specified");
  }
  const target_project_id = opts.target_project_id ?? project_id;
  const target_path = opts.target_path ?? path;

  // check that both UUID's are valid
  if (!is_valid_uuid_string(project_id)) {
    throw Error(`project_id=${project_id} is invalid`);
  }
  if (!is_valid_uuid_string(target_project_id)) {
    throw Error(`target_project_id=${target_project_id} is invalid`);
  }

  // determine canonical absolute path to source
  const sourceHome = homePath(project_id);
  const source_abspath = resolve(join(sourceHome, path));
  if (!source_abspath.startsWith(sourceHome)) {
    throw Error(`source path must be contained in project home dir`);
  }
  // determine canonical absolute path to target
  const targetHome = homePath(target_project_id);
  const target_abspath = resolve(join(targetHome, target_path));
  if (!target_abspath.startsWith(targetHome)) {
    throw Error(`target path must be contained in target project home dir`);
  }

  // check for trivial special case.
  if (source_abspath == target_abspath) {
    return;
  }

  // This can throw an exception if path doesn't exist, which is fine.
  const stats = await stat(source_abspath);
  // We will use this to decide if we need to add / at end in rsync args.
  const isDir = stats.isDirectory();

  // Handle args and options to rsync.
  // saxz = compressed, archive mode (so leave symlinks, etc.), don't cross filesystem boundaries
  // However, omit-link-times -- see http://forums.whirlpool.net.au/archive/2317650 and
  //                                 https://github.com/sagemathinc/cocalc/issues/2713
  const args: string[] = ["-zaxs", "--omit-link-times"];
  if (!overwrite_newer) {
    args.push("--update");
  }
  if (backup) {
    args.push("--backup");
  }
  if (delete_missing) {
    // IMPORTANT: newly created files will be deleted even if overwrite_newer is true
    args.push("--delete");
  }
  if (bwlimit) {
    args.push(`--bwlimit=${bwlimit}`);
  }
  if (timeout) {
    args.push(`--timeout=${timeout}`);
  }
  if (target_uid && target_project_id != project_id) {
    // change target ownership on copy; only do this if explicitly requested and needed.
    args.push(`--chown=${target_uid}:${target_uid}`);
  }
  args.push("--ignore-errors");

  args.push(source_abspath + (isDir ? "/" : ""));
  args.push(target_abspath + (isDir ? "/" : ""));

  // do the copy!
  winston.info(`rsync ${args.join(" ")}`);
  await spawn("rsync", args);
}
