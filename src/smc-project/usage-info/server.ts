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
  return Math.abs(b - a) / Math.min(a, b) > 0.05;
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

  // get the process at the given path – for now, that only works for jupyter notebooks
  private path_process(): Process | undefined {
    if (this.info?.processes == null) return;
    for (const p of Object.values(this.info.processes)) {
      const cocalc = p.cocalc;
      if (cocalc == null || cocalc.type != "jupyter") continue;
      if (cocalc.path == this.path) return p;
    }
  }

  // we compute the total cpu and memory usage sum for the given PID
  // this is a quick recursive traverse, with "stats" as the accumulator
  private proces_tree_stats(ppid: number, stats) {
    const procs = this.info?.processes;
    if (procs == null) return;
    for (const proc of Object.values(procs)) {
      if (proc.ppid != ppid) continue;
      this.proces_tree_stats(proc.pid, stats);
      stats.mem += proc.stat.mem.rss;
      stats.cpu += proc.cpu.pct;
    }
  }

  // cpu usage sum of all children
  private usage_children(pid): { cpu: number; mem: number } {
    const stats = { mem: 0, cpu: 0 };
    this.proces_tree_stats(pid, stats);
    return stats;
  }

  // we silently treat non-existing information as zero usage
  private path_usage_info(): {
    cpu: number;
    cpu_chld: number;
    mem: number;
    mem_chld: number;
  } {
    const proc = this.path_process();
    if (proc == null) {
      return { cpu: 0, mem: 0, cpu_chld: 0, mem_chld: 0 };
    } else {
      // we send whole numbers. saves bandwidth and won't be displayed anyways
      const children = this.usage_children(proc.pid);
      return {
        cpu: Math.round(proc.cpu.pct),
        cpu_chld: Math.round(children.cpu),
        mem: Math.round(proc.stat.mem.rss),
        mem_chld: Math.round(children.mem),
      };
    }
  }

  // this function takes the "info" we have (+ more maybe?)
  // and derives specific information for the notebook (future: also other file types)
  // at the given path.
  private update(): void {
    if (this.info == null) {
      L("was told to update, but there is no ProjectInfo");
      return;
    }

    const cg = this.info.cgroup;
    const du = this.info.disk_usage;
    if (cg == null || du == null) {
      this.dbg("info incomplete, can't send usage data");
      return;
    }
    const mem_rss = cg.mem_stat.total_rss + (du.tmp?.usage ?? 0);
    const mem_tot = cg.mem_stat.hierarchical_memory_limit;

    const usage = {
      time: Date.now(),
      ...this.path_usage_info(),
      mem_limit: mem_tot,
      cpu_limit: cg.cpu_cores_limit,
      mem_free: Math.max(0, mem_tot - mem_rss),
    };
    // this.dbg("usage", usage);
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
    const keys: (keyof UsageInfo)[] = ["cpu", "mem", "cpu_chld", "mem_chld"];
    for (const key of keys) {
      //  we want everyone to know if essentially dropped to zero
      if ((this.last[key] ?? 0) >= 1 && (usage[key] ?? 0) < 1) return true;
      // … or of one of the values is significantly different
      if (is_diff(usage, this.last, key)) return true;
    }
    // … or if the remaining memory changed
    // i.e. if another process uses up a portion, there's less for the current notebook
    if (is_diff(usage, this.last, "mem_free")) return true;
    return false;
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
