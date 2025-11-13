/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Usage Info Server

This derives usage information (cpu, mem, etc.)
for a specific "path" (e.g. the corresponding jupyter process for a notebook)
from the ProjectInfoServer (which collects data about everything).

It is made available via a service in @cocalc/conat/project/usage-info.
*/

import { EventEmitter } from "node:events";
import { getLogger } from "@cocalc/project/logger";
import {
  ProjectInfoServer,
  get_ProjectInfoServer,
} from "@cocalc/project/project-info";
import { Process, ProjectInfo } from "@cocalc/util/types/project-info/types";
import type { UsageInfo } from "@cocalc/util/types/project-usage-info";
import {
  createUsageInfoService,
  type UsageInfoService,
} from "@cocalc/conat/project/usage-info";
import { compute_server_id, project_id } from "@cocalc/project/data";

export const UPDATE_INTERVAL_S = 2;

const logger = getLogger("usage-info");

function is_diff(prev: UsageInfo, next: UsageInfo, key: keyof UsageInfo) {
  // we assume a,b >= 0, hence we leave out Math.abs operations
  const a = prev[key] ?? 0;
  const b = next[key] ?? 0;
  if (a === 0 && b === 0) return false;
  return Math.abs(b - a) / Math.min(a, b) > 0.05;
}

let server: UsageInfoService | null = null;
export function init() {
  server = createUsageInfoService({
    project_id,
    compute_server_id,
    createUsageInfoServer: (path) => new UsageInfoServer(path),
  });
}

export function close() {
  server?.close();
  server = null;
}

export class UsageInfoServer extends EventEmitter {
  private readonly dbg: Function;
  private readonly project_info: ProjectInfoServer;
  private readonly path: string;
  private info?: ProjectInfo;
  private usage?: UsageInfo;
  private last?: UsageInfo;

  constructor(path: string) {
    super();
    this.path = path;
    this.dbg = (...args) => logger.debug(this.path, ...args);
    this.project_info = get_ProjectInfoServer();
    this.project_info.on("info", this.handleUpdate);
  }

  close = (): void => {
    this.project_info?.removeListener("info", this.handleUpdate);
    // @ts-ignore
    delete this.project_info;
    // @ts-ignore
    delete this.dbg;
    // @ts-ignore
    delete this.path;
  };

  private handleUpdate = (info) => {
    this.info = info;
    this.update();
  };

  // get the process at the given path – for now, that only works for jupyter notebooks
  private getProcessAtPath = (): Process | undefined => {
    if (this.info?.processes == null) {
      return;
    }
    for (const p of Object.values(this.info.processes)) {
      const cocalc = p.cocalc;
      if (cocalc == null || cocalc.type != "jupyter") {
        continue;
      }
      if (cocalc.path == this.path) {
        return p;
      }
    }
  };

  // we compute the total cpu and memory usage sum for the given PID
  // this is a quick recursive traverse, with "stats" as the accumulator
  private processTreeStats = (ppid: number, stats) => {
    const procs = this.info?.processes;
    if (procs == null) return;
    for (const proc of Object.values(procs)) {
      if (proc.ppid != ppid) continue;
      this.processTreeStats(proc.pid, stats);
      stats.mem += proc.stat.mem.rss;
      stats.cpu += proc.cpu.pct;
    }
  };

  // cpu usage sum of all children
  private cpuUsageSumOfChildren = (pid): { cpu: number; mem: number } => {
    const stats = { mem: 0, cpu: 0 };
    this.processTreeStats(pid, stats);
    return stats;
  };

  // we silently treat non-existing information as zero usage
  private pathUsageInfo = (): {
    cpu: number;
    cpu_chld: number;
    mem: number;
    mem_chld: number;
  } => {
    const proc = this.getProcessAtPath();
    if (proc == null) {
      return { cpu: 0, mem: 0, cpu_chld: 0, mem_chld: 0 };
    } else {
      // we send whole numbers. saves bandwidth and won't be displayed anyways
      const children = this.cpuUsageSumOfChildren(proc.pid);
      return {
        cpu: Math.round(proc.cpu.pct),
        cpu_chld: Math.round(children.cpu),
        mem: Math.round(proc.stat.mem.rss),
        mem_chld: Math.round(children.mem),
      };
    }
  };

  // this function takes the "info" we have (+ more maybe?)
  // and derives specific information for the notebook (future: also other file types)
  // at the given path.
  private update = (): void => {
    if (this.info == null) {
      this.dbg("no info");
      return;
    }

    const cg = this.info.cgroup;
    const du = this.info.disk_usage;
    const mem_rss = (cg?.mem_stat?.total_rss ?? 0) + (du?.tmp?.usage ?? 0);
    const mem_tot = cg?.mem_stat?.hierarchical_memory_limit ?? 0;

    const usage = {
      time: Date.now(),
      ...this.pathUsageInfo(),
      mem_limit: mem_tot,
      cpu_limit: cg?.cpu_cores_limit ?? 0,
      mem_free: Math.max(0, mem_tot - mem_rss),
    };
    // this.dbg("usage", usage);
    if (this.shouldUpdate(usage)) {
      this.usage = usage;
      this.emit("usage", this.usage);
      this.last = this.usage;
    }
  };

  // only cause to emit a change if it changed significantly (more than x%),
  // or if it changes close to zero (in particular, if cpu usage is low again)
  private shouldUpdate = (usage: UsageInfo): boolean => {
    if (this.last == null) {
      return true;
    }
    if (usage == null) {
      return false;
    }
    const keys: (keyof UsageInfo)[] = ["cpu", "mem", "cpu_chld", "mem_chld"];
    for (const key of keys) {
      //  we want everyone to know if essentially dropped to zero
      if ((this.last[key] ?? 0) >= 1 && (usage[key] ?? 0) < 1) {
        return true;
      }
      // … or of one of the values is significantly different
      if (is_diff(usage, this.last, key)) {
        return true;
      }
    }
    // … or if the remaining memory changed
    // i.e. if another process uses up a portion, there's less for the current notebook
    if (is_diff(usage, this.last, "mem_free")) {
      return true;
    }
    return false;
  };
}
