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
import { ProjectInfoServer, get_ProjectInfoServer } from "../project-info";
import { ProjectInfo, Process } from "../project-info/types";
import { UsageInfo } from "./types";

function is_diff(prev: UsageInfo, next: UsageInfo, key: keyof UsageInfo) {
  // we assume a,b >= 0, hence we leave out Math.abs operations
  const a = prev[key] ?? 0;
  const b = next[key] ?? 0;
  if (a === 0 && b === 0) return false;
  return Math.abs(b - a) / Math.max(a, b) > 0.05;
}

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

  private path_process(): Process | undefined {
    if (this.info?.processes == null) return;
    for (const p of Object.values(this.info.processes)) {
      const cocalc = p.cocalc;
      if (cocalc == null || cocalc.type != "jupyter") continue;
      if (cocalc.path == this.path) return p;
    }
  }

  // we silently treat non-existing information as zero usage
  private path_usage_info(): { cpu: number; mem: number } {
    const proc = this.path_process();
    if (proc == null) {
      return { cpu: 0, mem: 0 };
    } else {
      return { cpu: proc.cpu.pct, mem: proc.stat.mem.rss };
    }
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
    const usage_proc = this.path_usage_info();
    const usage = {
      time: Date.now(),
      ...usage_proc,
      mem_limit: this.info.cgroup?.mem_stat.hierarchical_memory_limit,
      cpu_limit: this.info.cgroup?.cpu_cores_limit,
    };
    if (this.should_update(usage)) {
      this.usage = usage;
      this.emit("usage", this.usage);
      this.last = this.usage;
    }
  }

  // only cause to emit a change if it changed significantly (more than x%),
  // or if it changes close to zero (in particular, if cpu usage is low again)
  private should_update(usage: UsageInfo): boolean {
    if (this.last == null) return true;
    if (usage == null) return false;
    // values are in % and mb. we want everyone to know if essentially dropped to zero
    if (this.last.cpu >= 1 && usage.cpu < 1) return true;
    if (this.last.mem >= 1 && usage.mem < 1) return true;
    // … or of one of the values is different
    return is_diff(usage, this.last, "cpu") || is_diff(usage, this.last, "mem");
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
      this.dbg("UsageInfoServer already running, cannot be started twice");
    } else {
      await this._start();
    }
  }

  private async _start(): Promise<void> {
    this.dbg("start");
    if (this.running) {
      throw Error("Cannot start UsageInfoServer twice");
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
