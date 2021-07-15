
import {
  BaseProject,
  CopyOptions,
  ProjectStatus,
  ProjectState,
  getProject,
} from "./base";

import getLogger from "smc-hub/logger";
const winston = getLogger("project-control-template");

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
    winston.debug("start ", this.project_id);
    throw Error("implement me");
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
