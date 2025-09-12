/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { exec as cp_exec } from "node:child_process";
import { readFile, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import {
  Cpu,
  Process,
  Processes,
  Stat,
  State,
} from "@cocalc/util/types/project-info/types";
import { getLogger } from "./logger";
import { envToInt } from "./misc/env-to-number";

const exec = promisify(cp_exec);

/**
 * Return information about all processes (up to a limit or filter) in the environment, where this node.js process runs.
 * This has been refactored out of project/project-info/server.ts.
 * It is also used by the backend itself in "execute-code.ts" – to gather info about a spawned async process.
 */

// this is a hard limit on the number of processes we gather, just to
// be on the safe side to avoid processing too much data.
const LIMIT = envToInt("COCALC_PROJECT_INFO_PROC_LIMIT", 1024);

interface ProcessStatsOpts {
  procLimit?: number;
  testing?: boolean;
  dbg?: Function;
}

export class ProcessStats {
  private readonly testing: boolean;
  private readonly procLimit: number;
  private readonly dbg: Function;
  private ticks: number;
  private pagesize: number;
  private last?: { timestamp: number; processes: Processes };

  constructor(opts?: ProcessStatsOpts) {
    this.procLimit = opts?.procLimit ?? LIMIT;
    this.dbg = opts?.dbg ?? getLogger("process-stats").debug;
    this.init();
  }

  // this grabs some kernel configuration values we need. they won't change
  public init = reuseInFlight(async () => {
    if (this.ticks == null) {
      const [p_ticks, p_pagesize] = await Promise.all([
        exec("getconf CLK_TCK"),
        exec("getconf PAGESIZE"),
      ]);
      // should be 100, usually
      this.ticks = parseInt(p_ticks.stdout.trim());
      // 4096?
      this.pagesize = parseInt(p_pagesize.stdout.trim());
    }
  });

  // the "stat" file contains all the information
  // this page explains what is what
  // https://man7.org/linux/man-pages/man5/proc.5.html
  private async stat(path: string): Promise<Stat> {
    // all time-values are in seconds
    const raw = await readFile(path, "utf8");
    // the "comm" field could contain additional spaces or parents
    const [i, j] = [raw.indexOf("("), raw.lastIndexOf(")")];
    const start = raw.slice(0, i - 1).trim();
    const end = raw.slice(j + 1).trim();
    const data = `${start} comm ${end}`.split(" ");
    const get = (idx) => parseInt(data[idx]);
    // "comm" is now a placeholder to keep indices as they are.
    // don't forget to account for 0 vs. 1 based indexing.
    const ret = {
      ppid: get(3),
      state: data[2] as State,
      utime: get(13) / this.ticks, // CPU time spent in user code, measured in clock ticks (#14)
      stime: get(14) / this.ticks, // CPU time spent in kernel code, measured in clock ticks (#15)
      cutime: get(15) / this.ticks, // Waited-for children's CPU time spent in user code (in clock ticks) (#16)
      cstime: get(16) / this.ticks, // Waited-for children's CPU time spent in kernel code (in clock ticks) (#17)
      starttime: get(21) / this.ticks, // Time when the process started, measured in clock ticks (#22)
      nice: get(18),
      num_threads: get(19),
      mem: { rss: (get(23) * this.pagesize) / (1024 * 1024) }, // MiB
    };
    return ret;
  }

  // delta-time for this and the previous process information
  private dt(timestamp) {
    return (timestamp - (this.last?.timestamp ?? 0)) / 1000;
  }

  // calculate cpu times
  private cpu({ pid, stat, timestamp }): Cpu {
    // we are interested in that processes total usage: user + system
    const total_cpu = stat.utime + stat.stime;
    // the fallback is chosen in such a way, that it says 0% if we do not have historic data
    const prev_cpu = this.last?.processes?.[pid]?.cpu.secs ?? total_cpu;
    const dt = this.dt(timestamp);
    // how much cpu time was used since last time we checked this process…
    const pct = 100 * ((total_cpu - prev_cpu) / dt);
    return { pct: pct, secs: total_cpu };
  }

  private async cmdline(path: string): Promise<string[]> {
    // we split at the null-delimiter and filter all empty elements
    return (await readFile(path, "utf8"))
      .split("\0")
      .filter((c) => c.length > 0);
  }

  // this gathers all the information for a specific process with the given pid
  private async process({ pid: pid_str, uptime, timestamp }): Promise<Process> {
    const base = join("/proc", pid_str);
    const pid = parseInt(pid_str);
    const fn = (name) => join(base, name);
    const [cmdline, exe, stat] = await Promise.all([
      this.cmdline(fn("cmdline")),
      readlink(fn("exe")),
      this.stat(fn("stat")),
    ]);
    return {
      pid,
      ppid: stat.ppid,
      cmdline,
      exe,
      stat,
      cpu: this.cpu({ pid, timestamp, stat }),
      uptime: uptime - stat.starttime,
    };
  }

  // this is how long the underlying machine is running
  // we need this information, because the processes' start time is
  // measured in "ticks" since the machine started
  private async uptime(): Promise<[number, Date]> {
    // return uptime in secs
    const out = await readFile("/proc/uptime", "utf8");
    const uptime = parseFloat(out.split(" ")[0]);
    const boottime = new Date(new Date().getTime() - 1000 * uptime);
    return [uptime, boottime];
  }

  // this is where we gather information about all running processes
  public async processes(
    timestamp?: number,
  ): Promise<{ procs: Processes; uptime: number; boottime: Date }> {
    timestamp ??= new Date().getTime();
    const [uptime, boottime] = await this.uptime();

    const procs: Processes = {};
    let n = 0;
    for (const pid of await readdir("/proc")) {
      if (!pid.match(/^[0-9]+$/)) continue;
      try {
        const proc = await this.process({ pid, uptime, timestamp });
        procs[proc.pid] = proc;
      } catch (err) {
        if (this.testing)
          this.dbg(`process ${pid} likely vanished – could happen – ${err}`);
      }
      // we avoid processing and sending too much data
      if (n > this.procLimit) {
        this.dbg(`too many processes – limit of ${this.procLimit} reached!`);
        break;
      } else {
        n += 1;
      }
    }
    this.last = { timestamp, processes: procs };
    return { procs, uptime, boottime };
  }
}

export interface ProcessTreeStats {
  rss: number;
  cpu_secs: number;
  cpu_pct: number;
}

/**
 * Recursively sum process statistics for a process and all its children.
 * This function aggregates CPU time, memory usage, and CPU percentage
 * for a process tree starting from the given PID.
 */
export function sumChildren(
  procs: Processes,
  children: { [pid: number]: number[] },
  pid: number,
): ProcessTreeStats | null {
  const proc = procs[`${pid}`];
  if (proc == null) {
    return null;
  }

  let rss = proc.stat.mem.rss;
  let cpu_secs = proc.cpu.secs;
  let cpu_pct = proc.cpu.pct;

  for (const ch of children[pid] ?? []) {
    const sc = sumChildren(procs, children, ch);
    if (sc == null) return null;
    rss += sc.rss;
    cpu_secs += sc.cpu_secs;
    cpu_pct += sc.cpu_pct;
  }

  return { rss, cpu_secs, cpu_pct };
}
