/*
multi-user: a multi-user Linux system where the hub runs as root,
so can create and delete user accounts, etc.

There is some security and isolation between projects, coming from
different operating system users.

This is mainly used for cocalc-docker, which is a deployment of
CoCalc running in a single docker container, with one hub running
as root.

This **executes some basic shell commands** (e.g., useradd, rsync)
to start and stop the project, copy files between projects, etc.

This code is very similar to single-user.ts, except with some
small modifications due to having to create and delete Linux users.
*/

import {
  chown,
  copyPath,
  createUser,
  deleteUser,
  ensureConfFilesExists,
  getEnvironment,
  getState,
  getStatus,
  homePath,
  isProjectRunning,
  launchProjectDaemon,
  mkdir,
  setupDataPath,
} from "./util";
import {
  BaseProject,
  CopyOptions,
  getProject,
  ProjectStatus,
  ProjectState,
} from "./base";
import getLogger from "@cocalc/backend/logger";
import { getUid } from "@cocalc/backend/misc";

const winston = getLogger("project-control:multi-user");

const MAX_START_TIME_MS = 30000;
const MAX_STOP_TIME_MS = 20000;

class Project extends BaseProject {
  private HOME: string;
  private uid: number;

  constructor(project_id: string) {
    super(project_id);
    this.HOME = homePath(this.project_id);
    this.uid = getUid(this.project_id);
  }

  async state(): Promise<ProjectState> {
    if (this.stateChanging != null) {
      return this.stateChanging;
    }
    const state = await getState(this.HOME);
    winston.debug(`got state of ${this.project_id} = ${JSON.stringify(state)}`);
    this.saveStateToDatabase(state);
    return state;
  }

  async status(): Promise<ProjectStatus> {
    const status = await getStatus(this.HOME);
    // TODO: don't include secret token in log message.
    winston.debug(
      `got status of ${this.project_id} = ${JSON.stringify(status)}`
    );
    this.saveStatusToDatabase(status);
    return status;
  }

  async start(): Promise<void> {
    if (this.stateChanging != null) return;
    winston.info(`start ${this.project_id}`);

    // Home directory
    const HOME = this.HOME;

    if (await isProjectRunning(HOME)) {
      winston.debug("start -- already running");
      await this.saveStateToDatabase({ state: "running" });
      return;
    }

    try {
      this.stateChanging = { state: "starting" };
      await this.saveStateToDatabase(this.stateChanging);
      await this.siteLicenseHook();

      await mkdir(HOME, { recursive: true });
      await createUser(this.project_id);
      await chown(HOME, this.uid);

      await ensureConfFilesExists(HOME, this.uid);

      // this.get('env') = extra env vars for project (from synctable):
      const env = await getEnvironment(this.project_id);

      winston.debug(`start ${this.project_id}: env = ${JSON.stringify(env)}`);

      // Setup files
      await setupDataPath(HOME, this.uid);

      // Fork and launch project server daemon
      await launchProjectDaemon(env, this.uid);

      await this.wait({
        until: async () => {
          if (!(await isProjectRunning(this.HOME))) {
            return false;
          }
          const status = await this.status();
          return !!status.secret_token && !!status["hub-server.port"];
        },
        maxTime: MAX_START_TIME_MS,
      });
    } finally {
      this.stateChanging = undefined;
      // ensure state valid
      await this.state();
    }
  }

  async stop(): Promise<void> {
    if (this.stateChanging != null) return;
    winston.info("stop ", this.project_id);
    if (!(await isProjectRunning(this.HOME))) {
      await this.saveStateToDatabase({ state: "opened" });
      return;
    }
    try {
      this.stateChanging = { state: "stopping" };
      await this.saveStateToDatabase(this.stateChanging);
      await deleteUser(this.project_id);
      await this.wait({
        until: async () => !(await isProjectRunning(this.HOME)),
        maxTime: MAX_STOP_TIME_MS,
      });
    } finally {
      this.stateChanging = undefined;
      // ensure state valid in database
      await this.state();
    }
  }

  async copyPath(opts: CopyOptions): Promise<string> {
    winston.debug("copyPath ", this.project_id, opts);
    await copyPath(
      opts,
      this.project_id,
      opts.target_project_id ? getUid(opts.target_project_id) : undefined
    );
    return "";
  }
}

export default function get(project_id: string): Project {
  return (getProject(project_id) as Project) ?? new Project(project_id);
}
