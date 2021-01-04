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

// only for testing, see bottom
if (require.main === module) {
  require("coffee-register");
}

interface Opts {
  verbose?: boolean;
}

class ProcessRenicer {
  private readonly verbose: boolean;
  private readonly project_info: ProjectInfoServer;
  private info?: ProjectInfo;

  constructor(opts?: Opts) {
    const { verbose = false } = opts ?? {};
    this.verbose = verbose;
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
    if (this.verbose) L("starting main loop");
    delay(30 * 1000);
    L(`ProjectInfo: `, this.info);
  }
}

let singleton: ProcessRenicer | undefined = undefined;

export function activate() {
  if (singleton != null) {
    L("blocking attempt to run ProcessRenicer twice");
    return;
  }
  singleton = new ProcessRenicer();
  return singleton;
}

// testing: $ ts-node autorenice.ts
if (require.main === module) {
  const pr = activate();
  L("activated ProcessRenicer in test mode", pr);
  delay(3 * 1000);
  L("test done");
}
