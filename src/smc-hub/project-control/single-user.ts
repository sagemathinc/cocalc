/*
Implementation of project control for development of CoCalc
from inside of a CoCalc project.
*/

import { join } from "path";
import {
  dataPath,
  launchProjectDaemon,
  mkdir,
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

const winston = getLogger("project-control:single-user");

class Project extends BaseProject {
  async state(opts: {
    force?: boolean;
    update?: boolean;
  }): Promise<{ error?: string; state?: ProjectState; time?: Date }> {
    console.log("state", opts);
    throw Error("implement me");
  }

  async status(): Promise<ProjectStatus> {
    winston.debug("status ", this.project_id);
    throw Error("implement me");
  }

  async start(): Promise<void> {
    winston.debug(`start ${this.project_id}`);

    // Determine home directory and ensure it exists
    const HOME = join(projects, this.project_id);

    if (await isProjectRunning(HOME)) {
      winston.debug("start -- already running");
      return;
    }

    await mkdir(HOME, { recursive: true });

    // Get extra env vars for project (from synctable):
    const extra_env: string = Buffer.from(
      JSON.stringify(this.get("env") ?? {})
    ).toString("base64");

    // Setup environment (will get merged in after process.env):
    const env = {
      ...sanitizedEnv(process.env),
      ...{
        HOME,
        DATA: dataPath(HOME),
        // important to reset the COCALC_ vars since server env has own in a project
        COCALC_PROJECT_ID: this.project_id,
        COCALC_USERNAME: this.project_id.split("-").join(""),
        COCALC_EXTRA_ENV: extra_env,
        PATH: `${HOME}/bin:${HOME}/.local/bin:${process.env.PATH}`,
      },
    };
    winston.debug(`start: env = ${JSON.stringify(env)}`);

    // Setup files
    await setupDataPath(HOME);

    // Fork and launch project server
    await launchProjectDaemon(env);
  }

  async stop(): Promise<void> {
    winston.debug("stop ", this.project_id);
    throw Error("implement me");
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
  const P: Project = getProject(project_id) ?? new Project(project_id);
  await P.waitUntilReady();
  return P;
}
