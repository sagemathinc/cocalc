import { promisify } from "util";
import { dirname, join, resolve } from "path";
import { exec as exec0, spawn } from "child_process";
import spawnAsync from "await-spawn";
import * as fs from "fs";
import { writeFile } from "fs/promises";
import { projects, root } from "@cocalc/backend/data";
import { is_valid_uuid_string } from "@cocalc/util/misc";
import { callback2 } from "@cocalc/util/async-utils";
import getLogger from "@cocalc/backend/logger";
import { CopyOptions, ProjectState, ProjectStatus } from "./base";
import { getUid } from "@cocalc/backend/misc";
import base_path from "@cocalc/backend/base-path";
import { db } from "@cocalc/database";
import { getProject } from ".";
import { conatServer } from "@cocalc/backend/data";
import { pidFilename } from "@cocalc/util/project-info";
import { executeCode } from "@cocalc/backend/execute-code";
import { getProjectSecretToken } from "./secret-token";

const logger = getLogger("project-control:util");

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
  return projects.replace("[project_id]", project_id);
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
  return join(dataPath(HOME), pidFilename);
}

let _bootTime = 0;
export async function bootTime(): Promise<number> {
  if (!_bootTime) {
    const { stdout } = await executeCode({ command: "uptime", args: ["-s"] });
    _bootTime = new Date(stdout).valueOf();
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

export async function isProjectRunning(HOME: string): Promise<boolean> {
  try {
    const pid = await getProjectPID(HOME);
    //logger.debug(`isProjectRunning(HOME="${HOME}") -- pid=${pid}`);
    return pidIsRunning(pid);
  } catch (err) {
    //logger.debug(`isProjectRunning(HOME="${HOME}") -- no pid ${err}`);
    // err would happen if file doesn't exist, which means nothing to do.
    return false;
  }
}

export async function setupDataPath(HOME: string, uid?: number): Promise<void> {
  const data = dataPath(HOME);
  logger.debug(`setup "${data}"...`);
  await rm(data, { recursive: true, force: true });
  await mkdir(data);
  if (uid != null) {
    await chown(data, uid);
  }
}

async function logLaunchParams(params): Promise<void> {
  const data = dataPath(params.env.HOME);
  const path = join(data, "launch-params.json");
  try {
    await writeFile(path, JSON.stringify(params, undefined, 2));
  } catch (err) {
    logger.debug(
      `WARNING: failed to write ${path}, which is ONLY used for debugging -- ${err}`,
    );
  }
}

export async function launchProjectDaemon(env, uid?: number): Promise<void> {
  logger.debug(`launching project daemon at "${env.HOME}"...`);
  const cwd = join(root, "packages/project");
  const cmd = "pnpm";
  const args = ["cocalc-project", "--daemon", "--init", "project_init.sh"];
  logger.debug(
    `"${cmd} ${args.join(" ")} from "${cwd}" as user with uid=${uid}`,
  );
  logLaunchParams({ cwd, env, cmd, args, uid });
  await promisify((cb: Function) => {
    const child = spawn(cmd, args, {
      env,
      cwd,
      uid,
      gid: uid,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
      if (stdout.length > 10000) {
        stdout = stdout.slice(-5000);
      }
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > 10000) {
        stderr = stderr.slice(-5000);
      }
    });
    child.on("error", (err) => {
      logger.debug(`project daemon error ${err} -- \n${stdout}\n${stderr}`);
      cb(err);
    });
    child.on("exit", async (code) => {
      logger.debug("project daemon exited with code", code);
      if (code != 0) {
        try {
          const s = (await readFile(env.LOGS)).toString();
          logger.debug("project log file ended: ", s.slice(-2000), {
            stdout,
            stderr,
          });
        } catch (err) {
          // there's a lot of reasons the log file might not even exist,
          // e.g., debugging is not enabled
          logger.debug("project log file ended - unable to read log ", err);
        }
      }
      cb(code);
    });
  })();
}

async function exec(
  command: string,
  verbose?: boolean,
): Promise<{ stdout: string; stderr: string }> {
  logger.debug(`exec '${command}'`);
  const output = await promisify(exec0)(command);
  if (verbose) {
    logger.debug(`output: ${JSON.stringify(output)}`);
  }
  return output;
}

export async function createUser(project_id: string): Promise<void> {
  const username = getUsername(project_id);
  try {
    await exec(`/usr/sbin/userdel ${username}`); // this also deletes the group
  } catch (_) {
    // See https://github.com/sagemathinc/cocalc/issues/6967 for why we try/catch everything and
    // that is fine. The user may or may not already exist.
  }
  const uid = `${getUid(project_id)}`;
  logger.debug("createUser: adding group");
  try {
    await exec(`/usr/sbin/groupadd -g ${uid} -o ${username}`, true);
  } catch (_) {}
  logger.debug("createUser: adding user");
  try {
    await exec(
      `/usr/sbin/useradd -u ${uid} -g ${uid} -o ${username} -m -d ${homePath(
        project_id,
      )} -s /bin/bash`,
      true,
    );
  } catch (_) {}
}

export async function stopProjectProcesses(project_id: string): Promise<void> {
  const uid = `${getUid(project_id)}`;
  const scmd = `pkill -9 -u ${uid} | true `; // | true since pkill exit 1 if nothing killed.
  await exec(scmd);
}

export async function deleteUser(project_id: string): Promise<void> {
  await stopProjectProcesses(project_id);
  const username = getUsername(project_id);
  try {
    await exec(`/usr/sbin/userdel ${username}`); // this also deletes the group
  } catch (_) {
    // not error if not there...
  }
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
): Promise<{ [key: string]: any }> {
  const extra: { [key: string]: any } = await callback2(
    db().get_project_extra_env,
    { project_id },
  );
  const extra_env: string = Buffer.from(JSON.stringify(extra ?? {})).toString(
    "base64",
  );

  const USER = getUsername(project_id);
  const HOME = homePath(project_id);
  const DATA = dataPath(HOME);

  return {
    ...sanitizedEnv(process.env),
    ...{
      HOME,
      BASE_PATH: base_path,
      DATA,
      LOGS: join(DATA, "logs"),
      DEBUG: "cocalc:*,-cocalc:silly:*", // so interesting stuff gets logged, but not too much unless we really need it.
      // important to reset the COCALC_ vars since server env has own in a project
      COCALC_PROJECT_ID: project_id,
      COCALC_USERNAME: USER,
      USER,
      COCALC_EXTRA_ENV: extra_env,
      PATH: `${HOME}/bin:${HOME}/.local/bin:${process.env.PATH}`,
      CONAT_SERVER: conatServer,
      COCALC_SECRET_TOKEN_VALUE: await getProjectSecretToken(project_id),
    },
  };
}

export async function getState(HOME: string): Promise<ProjectState> {
  logger.debug(`getState("${HOME}")`);
  try {
    return {
      ip: "127.0.0.1",
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
  logger.debug(`getStatus("${HOME}")`);
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
  uid?: number,
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
        if (uid != null) {
          await chown(target, uid);
        }
      } catch (err) {
        logger.error(`ensureConfFilesExists -- ${err}`);
      }
    }
  }
}

// Copy a path using rsync and the specified options
// on the local filesystem.
// NOTE: the scheduled CopyOptions
// are not implemented at all here.
export async function copyPath(
  opts: CopyOptions,
  project_id: string,
  target_uid?: number,
): Promise<void> {
  logger.info(`copyPath(source="${project_id}"): opts=${JSON.stringify(opts)}`);
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
  const args: string[] = [];
  if (process.platform == "darwin") {
    // MacOS rsync is pretty cripled, so we omit some very helpful options.
    args.push("-zax");
  } else {
    args.push(...["-zaxs", "--omit-link-times"]);
  }
  if (opts.exclude) {
    for (const pattern of opts.exclude) {
      args.push("--exclude");
      args.push(pattern);
    }
  }
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

  args.push(source_abspath + (isDir ? "/" : ""));
  args.push(target_abspath + (isDir ? "/" : ""));

  async function make_target_path() {
    // note -- uid/gid ignored if target_uid not set.
    if (isDir) {
      await spawnAsync("mkdir", ["-p", target_abspath], {
        uid: target_uid,
        gid: target_uid,
      });
    } else {
      await spawnAsync("mkdir", ["-p", dirname(target_abspath)], {
        uid: target_uid,
        gid: target_uid,
      });
    }
  }

  // For making the target directory when target_uid is specified,
  // we need to use setuid and be the target user, since otherwise
  // the permissions are wrong on the containing directory,
  // as explained here: https://github.com/sagemathinc/cocalc-docker/issues/146
  // However, this will fail if the user hasn't been created, hence
  // this code is extra complicated.
  try {
    await make_target_path();
  } catch (_err) {
    // The above probably failed due to the uid/gid not existing.
    // In that case, we create the user, then try again.
    await createUser(target_project_id);
    await make_target_path();
    // Assuming the above did work, it's very likely the original
    // failing was due to the user not existing, so now we delete
    // it again.
    await deleteUser(target_project_id);
  }

  // do the copy!
  logger.info(`doing rsync ${args.join(" ")}`);
  if (opts.wait_until_done ?? true) {
    try {
      const stdout = await spawnAsync("rsync", args, {
        timeout: opts.timeout
          ? 1000 * opts.timeout
          : undefined /* spawnAsync has ms units, but rsync has second units */,
      });
      logger.info(`finished rsync ${stdout}`);
    } catch (err) {
      throw Error(
        `WARNING: copy exited with an error -- ${
          err.stderr
        } -- "rsync ${args.join(" ")}"`,
      );
    }
  } else {
    // TODO/NOTE: this will silently not report any errors.
    spawn("rsync", args, { timeout: opts.timeout });
  }
}

export async function restartProjectIfRunning(project_id: string) {
  // If necessary, restart project to ensure that license gets applied.
  // This is not bullet proof in all cases, e.g., for a newly created project,
  // and it is better to apply the license when creating the project if possible.
  const project = getProject(project_id);
  const { state } = await project.state();
  if (state == "starting" || state == "running") {
    // don't await this -- it could take a long time and isn't necessary to wait for.
    (async () => {
      await project.restart();
    })();
  }
}
