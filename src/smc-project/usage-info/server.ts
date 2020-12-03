/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Usage Info Server

This derives usage information (cpu, mem, etc.)
for a specific "path" (e.g. the corresponding jupyter process for a notebook)
from the ProjectInfoServer (which collects data about everything)
*/

// only for testing, see bottom
if (require.main === module) {
  require("coffee-register");
}

import * as debug from "debug";
const L = debug("project:usage-info:server");
import { EventEmitter } from "events";
import { delay } from "awaiting";
import { isEqual } from "lodash";
import { ProjectInfoServer, get_ProjectInfoServer } from "../project-info";
import { ProjectInfo } from "../project-info/types";
import { UsageInfo } from "./types";

export class UsageInfoServer extends EventEmitter {
  private readonly dbg: Function;
  private running = false;
  private readonly testing: boolean;
  private readonly project_info: ProjectInfoServer;
  private readonly path: string;
  private info?: ProjectInfo;
  private usage?: UsageInfo;
  private last?: UsageInfo;

  constructor(path, testing = false) {
    super();
    //this.update = reuseInFlight(this.update.bind(this));
    this.testing = testing;
    this.path = path;
    this.dbg = L;
    this.project_info = get_ProjectInfoServer();
    this.dbg("starting");
  }

  private async init(): Promise<void> {
    this.project_info.start();
    this.project_info.on("info", (info) => {
      //this.dbg(`got info timestamp=${info.timestamp}`);
      this.info = info;
      this.update();
    });
  }

  // this function takes the "info" we have (+ more maybe?)
  // and derives specific information for the notebook (future: also other file types)
  // at the given path.
  private update(): void {
    if (this.info == null) {
      L("told to update, but there is no ProjectInfo");
      return;
    }
    // TODO this is just random data for testing
    this.dbg(
      `getting usage for ${this.path} from info at `,
      this.info.timestamp
    );
    const usage = {
      time: Date.now(),
      mem: Math.round(100 + 1300 * Math.random()),
      cpu: Math.round(100 * Math.random()),
      mem_limit: this.info.cgroup?.mem_stat.hierarchical_memory_limit,
      cpu_limit: this.info.cgroup?.cpu_cores_limit,
    };
    this.usage = usage;
    // TODO make this only emit if change is in any way large (more than x%),
    // or if it changes close to zero (in particular, if cpu usage is low again)
    if (!isEqual(this.usage, this.last)) {
      this.emit("usage", this.usage);
      this.last = this.usage;
    }
  }

  private async get_usage(): Promise<UsageInfo | undefined> {
    this.update();
    return this.usage;
  }

  public stop(): void {
    this.running = false;
  }

  public async start(): Promise<void> {
    if (this.running) {
      this.dbg("alerady running, cannot be started twice");
    } else {
      await this._start();
    }
  }

  private async _start(): Promise<void> {
    this.dbg("start");
    if (this.running) {
      throw Error("Cannot start ProjectStatusServer twice");
    }
    this.running = true;
    await this.init();

    // emit once after startup
    const usage = await this.get_usage();
    this.emit("usage", usage);

    while (this.testing) {
      await delay(5000);
      const usage = await this.get_usage();
      this.emit("usage", usage);
    }
  }
}

// testing: $ ts-node server.ts
if (require.main === module) {
  const uis = new UsageInfoServer("testing.ipynb", true);
  uis.start();
  let cnt = 0;
  uis.on("usage", (usage) => {
    console.log(JSON.stringify(usage, null, 2));
    cnt += 1;
    if (cnt >= 2) process.exit();
  });
}
