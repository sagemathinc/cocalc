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

import getLogger from "@cocalc/backend/logger";
import {
  BaseProject,
  CopyOptions,
  ProjectState,
  ProjectStatus,
  getProject,
} from "./base";
import { copyPath, getState, getStatus, homePath } from "./util";

const logger = getLogger("project-control:single-user");

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
    this.saveStateToDatabase(state);
    return state;
  }

  async status(): Promise<ProjectStatus> {
    this.HOME ??= await homePath(this.project_id);
    const status = await getStatus(this.HOME);
    // TODO: don't include secret token in log message.
    logger.debug(
      `got status of ${this.project_id} = ${JSON.stringify(status)}`,
    );
    await this.saveStatusToDatabase(status);
    return status;
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
