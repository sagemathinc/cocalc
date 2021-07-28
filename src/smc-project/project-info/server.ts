/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Project information server, doing the heavy lifting of telling the client
about what's going on in a project.
*/

import * as debug from "debug";
const L = debug("project:project-info:server");
import { delay } from "awaiting";
import { join } from "path";
import { exec } from "./utils";
import { options } from "../init-program";
import { promises as fsPromises } from "fs";
import { pid2path as terminal_pid2path } from "../terminal/server";
import { get_path_for_pid as x11_pid2path } from "../x11/server";
import { get_kernel_by_pid } from "../jupyter/jupyter";
const { readFile, readdir, readlink } = fsPromises;
import { check as df } from "diskusage";
import { EventEmitter } from "events";
import {
  Cpu,
  Process,
  Processes,
  ProjectInfo,
  Stat,
  State,
  DiskUsage,
  CoCalcInfo,
  CGroup,
} from "./types";
//const { get_sage_path } = require("../sage_session");

function is_in_dev_project() {
  return process.env.SMC_LOCAL_HUB_HOME != null;
}

// this is a hard limit on the number of processes we gather, just to
// be on the safe side to avoid processing too much data.
const LIMIT = 100;
const bytes2MiB = (bytes) => bytes / (1024 * 1024);

export class ProjectInfoServer extends EventEmitter {
  private last?: ProjectInfo = undefined;
  private readonly dbg: Function;
  private running = false;
  private readonly testing: boolean;
  private ticks: number;
  private pagesize: number;
  private delay_s: number;

  constructor(testing = false) {
    super();
    this.delay_s = 2;
    this.testing = testing;
    this.dbg = L;
  }

  public latest(): ProjectInfo | undefined {
    return this.last;
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

  // for a process we know (pid, etc.) we try to map to cocalc specific information
  private cocalc({ pid, cmdline }): CoCalcInfo | undefined {
    //this.dbg("classify", { pid, exe, cmdline });
    if (pid === process.pid) {
      return { type: "project" };
    }
    // TODO use get_sage_path to get a path to a sagews
    const jupyter_kernel = get_kernel_by_pid(pid);
    if (jupyter_kernel != null) {
      return { type: "jupyter", path: jupyter_kernel.get_path() };
    }
    const termpath = terminal_pid2path(pid);
    if (termpath != null) {
      return { type: "terminal", path: termpath };
    }
    const x11_path = x11_pid2path(pid);
    if (x11_path != null) {
      return { type: "x11", path: x11_path };
    }
    // SSHD: strangely, just one long string in cmdline[0]
    if (
      cmdline.length === 1 &&
      cmdline[0].startsWith("sshd:") &&
      cmdline[0].indexOf("-p 2222") != -1
    ) {
      return { type: "sshd" };
    }
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
    const data = {
      pid,
      ppid: stat.ppid,
      cmdline,
      exe,
      stat,
      cpu: this.cpu({ pid, timestamp, stat }),
      uptime: uptime - stat.starttime,
      cocalc: this.cocalc({ pid, cmdline }),
    };
    return data;
  }

  // this is where we gather information about all running processes
  private async processes({ timestamp, uptime }): Promise<Processes> {
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
      if (n > LIMIT) {
        this.dbg(`too many processes – limit of ${LIMIT} reached!`);
        break;
      } else {
        n += 1;
      }
    }
    return procs;
  }

  // this is specific to running a project in a CGroup container
  // however, even without a container this shouldn't fail … just tells
  // you what the whole system is doing, all your processes,…
  // NOTE: most of this replaces kucalc.coffee
  private async cgroup({ timestamp }): Promise<CGroup | undefined> {
    if (!is_in_dev_project() && !options.kucalc && !this.testing) return;
    const [
      mem_stat_raw,
      cpu_raw,
      oom_raw,
      cfs_quota_raw,
      cfs_period_raw,
    ] = await Promise.all([
      readFile("/sys/fs/cgroup/memory/memory.stat", "utf8"),
      readFile("/sys/fs/cgroup/cpu,cpuacct/cpuacct.usage", "utf8"),
      readFile("/sys/fs/cgroup/memory/memory.oom_control", "utf8"),
      readFile("/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_quota_us", "utf8"),
      readFile("/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_period_us", "utf8"),
    ]);
    const mem_stat_keys = [
      "total_rss",
      "total_cache",
      "hierarchical_memory_limit",
    ];
    const cpu_usage = parseFloat(cpu_raw) / Math.pow(10, 9);
    const dt = this.dt(timestamp);
    const cpu_usage_rate =
      this.last?.cgroup != null
        ? (cpu_usage - this.last.cgroup.cpu_usage) / dt
        : 0;
    const [cfs_quota, cfs_period] = [
      parseInt(cfs_quota_raw),
      parseInt(cfs_period_raw),
    ];
    const mem_stat = mem_stat_raw
      .split("\n")
      .map((line) => line.split(" "))
      .filter(([k, _]) => mem_stat_keys.includes(k))
      .reduce((stat, [key, val]) => {
        stat[key] = bytes2MiB(parseInt(val));
        return stat;
      }, {});
    const oom_kills = oom_raw
      .split("\n")
      .filter((val) => val.startsWith("oom_kill "))
      .map((val) => parseInt(val.slice("oom_kill ".length)))[0];
    return {
      mem_stat,
      cpu_usage,
      cpu_usage_rate,
      cpu_cores_limit: cfs_quota / cfs_period,
      oom_kills,
    };
  }

  // for cocalc/kucalc we want to know the disk usage + limits of the
  // users home dir and /tmp. /tmp is a ram disk, which will count against
  // the overall memory limit!
  private async disk_usage(): Promise<DiskUsage> {
    const convert = function (val) {
      return {
        total: bytes2MiB(val.total),
        free: bytes2MiB(val.free),
        available: bytes2MiB(val.available),
        usage: bytes2MiB(val.total - val.free),
      };
    };
    const [tmp, project] = await Promise.all([
      df("/tmp"),
      df(process.env.HOME ?? "/home/user"),
    ]);
    return { tmp: convert(tmp), project: convert(project) };
  }

  // this grabs some kernel configuration values we need. they won't change
  private async init(): Promise<void> {
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
  }

  // orchestrating where all the information is bundled up for an update
  private async get_info(): Promise<ProjectInfo> {
    const [uptime, boottime] = await this.uptime();
    const timestamp = new Date().getTime();
    const [processes, cgroup, disk_usage] = await Promise.all([
      this.processes({ uptime, timestamp }),
      this.cgroup({ timestamp }),
      this.disk_usage(),
    ]);
    const info: ProjectInfo = {
      timestamp,
      processes,
      uptime,
      boottime,
      cgroup,
      disk_usage,
    };
    return info;
  }

  public stop() {
    this.running = false;
  }

  public async start(): Promise<void> {
    if (this.running) {
      this.dbg("project-info/server: already running, cannot be started twice");
    } else {
      await this._start();
    }
  }

  private async _start(): Promise<void> {
    this.dbg("start");
    if (this.running) {
      throw Error("Cannot start ProjectInfoServer twice");
    }
    this.running = true;
    await this.init();
    while (true) {
      //this.dbg(`listeners on 'info': ${this.listenerCount("info")}`);
      const info = await this.get_info();
      this.last = info;
      this.emit("info", info);
      if (this.running) {
        await delay(1000 * this.delay_s);
      } else {
        this.dbg("start: no longer running → stopping loop");
        this.last = undefined;
        return;
      }
      // in test mode just one more, that's enough
      if (this.last != null && this.testing) {
        const info = await this.get_info();
        this.dbg(JSON.stringify(info, null, 2));
        return;
      }
    }
  }
}

// testing: $ ts-node server.ts
if (require.main === module) {
  const pis = new ProjectInfoServer(true);
  pis.start().then(() => process.exit());
}
