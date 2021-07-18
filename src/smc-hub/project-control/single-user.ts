/*
This is meant to run on a multi-user system, but where the hub
runs as a single user and all projects also run as that same
user, but with there own HOME directories.  There is thus no
security or isolation at all between projects.  There is still
a notion of multiple cocalc projects and cocalc users.

This is useful for:
  - development of cocalc from inside of a CoCalc project
  - non-collaborative use of cocalc on your own
    laptop, e.g., when you're on an airplane.
*/

import { kill } from "process";

import {
  copyPath,
  ensureConfFilesExists,
  getEnvironment,
  getProjectPID,
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
  ProjectStatus,
  ProjectState,
  getProject,
} from "./base";
import getLogger from "smc-hub/logger";

const winston = getLogger("project-control:single-user");

// Usually should fully start in about 5 seconds, but we give it 20s.
const MAX_START_TIME_MS = 20000;
const MAX_STOP_TIME_MS = 10000;

class Project extends BaseProject {
  private HOME: string;

  constructor(project_id: string) {
    super(project_id);
    this.host = "localhost";
    this.HOME = homePath(this.project_id);
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
    winston.info(`start ${this.project_id}`);
    if (this.stateChanging != null) return;

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

      await ensureConfFilesExists(HOME);

      // this.get('env') = extra env vars for project (from synctable):
      const env = await getEnvironment(this.project_id);
      winston.debug(`start ${this.project_id}: env = ${JSON.stringify(env)}`);

      // Setup files
      await setupDataPath(HOME);

      // Fork and launch project server
      await launchProjectDaemon(env);

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
      // ensure state valid in database
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
      try {
        const pid = await getProjectPID(this.HOME);
        kill(-pid);
      } catch (_err) {
        // expected exception if no pid
      }
      await this.wait({
        until: async () => !(await isProjectRunning(this.HOME)),
        maxTime: MAX_STOP_TIME_MS,
      });
    } finally {
      this.stateChanging = undefined;
      // ensure state valid.
      await this.state();
    }
  }

  async copyPath(opts: CopyOptions): Promise<string> {
    winston.debug("copyPath ", this.project_id, opts);
    await copyPath(opts, this.project_id);
    return "";
  }
}

export default async function get(project_id: string): Promise<Project> {
  const P: Project =
    (getProject(project_id) as Project) ?? new Project(project_id);
  await P.waitUntilReady();
  return P;
}
