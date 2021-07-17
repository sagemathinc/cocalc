/*
multi-user: a multi-user Linux system where the hub runs as root,
so can create and delete user accounts, etc.
*/

import { join } from "path";

import {
  BaseProject,
  CopyOptions,
  ProjectStatus,
  ProjectState,
  getProject,
} from "./base";
import { projects } from "smc-util-node/data";

import getLogger from "smc-hub/logger";
const winston = getLogger("project-control-kubernetes");

class Project extends BaseProject {
  private HOME: string;

  constructor(project_id: string) {
    super(project_id);
    this.host = "localhost";
    this.HOME = join(projects, this.project_id);
    console.log(this.HOME);
  }

  async state(opts: {
    force?: boolean;
    update?: boolean;
  }): Promise<ProjectState> {
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

}

export default async function get(project_id: string): Promise<Project> {
  const P: Project =
    (getProject(project_id) as Project) ?? new Project(project_id);
  await P.waitUntilReady();
  return P;
}
