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

import { copyPath, getState, getStatus, homePath } from "./util";
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

class Project extends BaseProject {
  private HOME?: string;

  constructor(project_id: string) {
    super(project_id);
  }

  async state(): Promise<ProjectState> {
    if (this.stateChanging != null) {
      return this.stateChanging;
    }
    this.HOME ??= await homePath(this.project_id);
    const state = await getState(this.HOME);
    winston.debug(`got state of ${this.project_id} = ${JSON.stringify(state)}`);
    this.saveStateToDatabase(state);
    return state;
  }

  async status(): Promise<ProjectStatus> {
    this.HOME ??= await homePath(this.project_id);
    const status = await getStatus(this.HOME);
    // TODO: don't include secret token in log message.
    winston.debug(
      `got status of ${this.project_id} = ${JSON.stringify(status)}`,
    );
    this.saveStatusToDatabase(status);
    return status;
  }

  async copyPath(opts: CopyOptions): Promise<string> {
    winston.debug("copyPath ", this.project_id, opts);
    await copyPath(
      opts,
      this.project_id,
      opts.target_project_id ? getUid(opts.target_project_id) : undefined,
    );
    return "";
  }
}

export default function get(project_id: string): Project {
  return (getProject(project_id) as Project) ?? new Project(project_id);
}
