/*
This is meant to run on a multi-user system, but where the hub
runs as a single user and all projects also run as that same
user, but with there own HOME directories.  There is thus no
security or isolation at all between projects.

This is useful for:
  - development of cocalc from inside of a CoCalc project
  - non-collaborative single-user use of cocalc on your own
    laptop, e.g., when you're on an airplane.
*/

import { join } from "path";
import { kill } from "process";

import {
  dataPath,
  ensureConfFilesExists,
  launchProjectDaemon,
  mkdir,
  getProjectPID,
  getState,
  getStatus,
  sanitizedEnv,
  setupDataPath,
  isProjectRunning,
} from "./util";
import {
  BaseProject,
  CopyOptions,
  ProjectStatus,
  ProjectState,
  getProject,
} from "./base";
import getLogger from "smc-hub/logger";

import { projects } from "smc-util-node/data";
import base_path from "smc-util-node/base-path";

const winston = getLogger("project-control:single-user");

// Usually should fully start in about 5 seconds, but we give it 20s.
const MAX_START_TIME_MS = 20000;
const MAX_STOP_TIME_MS = 10000;

class Project extends BaseProject {
  private HOME: string;

  constructor(project_id: string) {
    super(project_id);
    this.host = "localhost";
    this.HOME = join(projects, this.project_id);
  }

  async state(
    opts: {
      force?: boolean;
      update?: boolean;
    } = {}
  ): Promise<ProjectState> {
    if (this.stateChanging != null) {
      return this.stateChanging;
    }
    const state = await getState(this.HOME, opts);
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
    winston.debug(`start ${this.project_id}`);
    if (this.stateChanging != null) return;

    // Determine home directory and ensure it exists
    const HOME = this.HOME;

    if (await isProjectRunning(HOME)) {
      winston.debug("start -- already running");
      await this.saveStateToDatabase({ state: "running" });
      return;
    }
    try {
      this.stateChanging = { state: "starting" };
      await this.saveStateToDatabase(this.stateChanging);

      await mkdir(HOME, { recursive: true });

      await ensureConfFilesExists(HOME);

      // Get extra env vars for project (from synctable):
      const extra_env: string = Buffer.from(
        JSON.stringify(this.get("env") ?? {})
      ).toString("base64");

      // Setup environment (will get merged in after process.env):
      const env = {
        ...sanitizedEnv(process.env),
        ...{
          HOME,
          BASE_PATH: base_path,
          DATA: dataPath(HOME),
          // important to reset the COCALC_ vars since server env has own in a project
          COCALC_PROJECT_ID: this.project_id,
          COCALC_USERNAME: this.project_id.split("-").join(""),
          COCALC_EXTRA_ENV: extra_env,
          PATH: `${HOME}/bin:${HOME}/.local/bin:${process.env.PATH}`,
        },
      };
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
      // ensure state valid
      await this.state();
    }
  }

  async stop(): Promise<void> {
    winston.debug("stop ", this.project_id);
    if (this.stateChanging != null) return;
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

  async doCopyPath(opts: CopyOptions) {
    winston.debug("doCopyPath ", this.project_id, opts);
    throw Error("implement me");
  }

  async directoryListing(opts: {
    path?: string;
    hidden?: boolean;
    time?: number;
    start?: number;
    limit?: number;
  }): Promise<any> {
    winston.debug("directoryListing ", this.project_id, opts);
    throw Error("implement me");
  }

  async doReadFile(opts: { path: string; maxsize: number }): Promise<Buffer> {
    winston.debug("doReadFile ", this.project_id, opts);
    throw Error("implement me");
  }
}

export default async function get(project_id: string): Promise<Project> {
  const P: Project =
    (getProject(project_id) as Project) ?? new Project(project_id);
  await P.waitUntilReady();
  return P;
}
