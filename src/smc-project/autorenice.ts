/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * This little utility tames process of this project to be kind to other users.
 * It's inspired by and – http://and.sourceforge.net/
 */

import * as debug from "debug";
const L = debug("project:autorenice");
import { delay } from "awaiting";
import { ProjectInfoServer, get_ProjectInfoServer } from "./project-info";
import { ProjectInfo } from "./project-info/types";

class ProcessRenicer {
  private readonly project_info: ProjectInfoServer;
  private info?: ProjectInfo;

  constructor() {
    this.project_info = get_ProjectInfoServer();
    this.init();
    this.start();
  }

  private async init(): Promise<void> {
    this.project_info.start();
    this.project_info.on("info", (info) => {
      this.update(info);
    });
  }

  // got new data from the ProjectInfoServer
  private update(info) {
    this.info = info;
  }

  // this is the main "infinite loop"
  private start(): void {
    delay(30 * 1000);
    L(`ProjectInfo: `, this.info);
  }
}

let pr: ProcessRenicer | undefined = undefined;

export function activate() {
  if (pr != null) {
    L("blocking attempt to run ProcessRenicer twice");
    return;
  }
  pr = new ProcessRenicer();
}
