/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

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


DEVELOPMENT:


~/cocalc/src/packages/server/projects/control$ COCALC_MODE='single-user' node
Welcome to Node.js v20.19.1.
Type ".help" for more information.
> a = require('@cocalc/server/projects/control');
> p = a.getProject('8a840733-93b6-415c-83d4-7e5712a6266b')
> await p.start()
*/

import { kill } from "node:process";
import getLogger from "@cocalc/backend/logger";
import {
  BaseProject,
  CopyOptions,
  ProjectState,
  ProjectStatus,
  getProject,
} from "./base";
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
  writeSecretToken,
} from "./util";
import {
  getProjectSecretToken,
  deleteProjectSecretToken,
} from "./secret-token";

const logger = getLogger("project-control:single-user");

// Usually should fully start in about 5 seconds, but we give it 20s.
const MAX_START_TIME_MS = 20000;
const MAX_STOP_TIME_MS = 10000;

class Project extends BaseProject {
  private HOME: string;

  constructor(project_id: string) {
    super(project_id);
    this.HOME = homePath(this.project_id);
  }

  async state(): Promise<ProjectState> {
    if (this.stateChanging != null) {
      return this.stateChanging;
    }
    const state = await getState(this.HOME);
    this.saveStateToDatabase(state);
    return state;
  }

  async status(): Promise<ProjectStatus> {
    const status = await getStatus(this.HOME);
    // TODO: don't include secret token in log message.
    logger.debug(
      `got status of ${this.project_id} = ${JSON.stringify(status)}`,
    );
    await this.saveStatusToDatabase(status);
    return status;
  }

  async start(): Promise<void> {
    logger.debug("start", this.project_id);
    if (this.stateChanging != null) return;

    // Home directory
    const HOME = this.HOME;

    if (await isProjectRunning(HOME)) {
      logger.debug("start -- already running");
      await this.saveStateToDatabase({ state: "running" });
      return;
    }

    try {
      this.stateChanging = { state: "starting" };
      await this.saveStateToDatabase(this.stateChanging);
      await this.computeQuota();
      await mkdir(HOME, { recursive: true });
      await ensureConfFilesExists(HOME);

      // this.get('env') = extra env vars for project (from synctable):
      const env = await getEnvironment(this.project_id);
      logger.debug(`start ${this.project_id}: env = ${JSON.stringify(env)}`);

      // Setup files
      await setupDataPath(HOME);

      await writeSecretToken(
        HOME,
        await getProjectSecretToken(this.project_id),
      );

      // Fork and launch project server
      await launchProjectDaemon(env);
      await this.touch(undefined, { noStart: true });

      await this.wait({
        until: async () => {
          if (!(await isProjectRunning(this.HOME))) {
            return false;
          }
          const status = await this.status();
          return !!status["hub-server.port"];
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
    logger.debug("stop: ", this.project_id);
    if (!(await isProjectRunning(this.HOME))) {
      logger.debug("stop: project not running so nothing to kill");
      await this.saveStateToDatabase({ state: "opened" });
      return;
    }
    try {
      this.stateChanging = { state: "stopping" };
      await this.saveStateToDatabase(this.stateChanging);
      const pid = await getProjectPID(this.HOME);

      // First attempt: graceful shutdown with SIGTERM
      // This allows the process to clean up child processes (e.g., Jupyter kernels)
      const stopStartedAt = Date.now();
      const SIGKILL_GRACE_MS = 5000;
      let sigkillSent = false;
      const killProject = (signal: NodeJS.Signals = "SIGTERM") => {
        try {
          logger.debug(`stop: sending kill -${pid} with ${signal}`);
          kill(-pid, signal);
        } catch (err) {
          // expected exception if no pid
          logger.debug(`stop: kill err ${err}`);
        }
      };

      // Try SIGTERM first for graceful shutdown
      killProject("SIGTERM");

      await this.wait({
        until: async () => {
          if (await isProjectRunning(this.HOME)) {
            // After a grace period, escalate to SIGKILL
            if (!sigkillSent && Date.now() - stopStartedAt >= SIGKILL_GRACE_MS) {
              logger.debug("stop: escalating to SIGKILL");
              killProject("SIGKILL");
              sigkillSent = true;
            }
            return false;
          } else {
            return true;
          }
        },
        maxTime: MAX_STOP_TIME_MS,
      });
      await deleteProjectSecretToken(this.project_id);
      logger.debug("stop: project is not running");
    } finally {
      this.stateChanging = undefined;
      // ensure state valid.
      await this.state();
    }
  }

  async copyPath(opts: CopyOptions): Promise<string> {
    logger.debug("copyPath ", this.project_id, opts);
    await copyPath(opts, this.project_id);
    return "";
  }
}

export default function get(project_id: string): Project {
  return (getProject(project_id) as Project) ?? new Project(project_id);
}
