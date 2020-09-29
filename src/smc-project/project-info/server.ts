/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Project information server, doing the heavy lifting
*/

import { delay } from "awaiting";
import { join } from "path";
import { exec } from "./utils";
import { running_in_kucalc } from "../init-program";
import { promises as fsPromises } from "fs";
import { pid2path as terminal_pid2path } from "../terminal/server";
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
  DF,
  CoCalcInfo,
  CGroup,
} from "./types";

const bytes2MiB = (bytes) => bytes / (1024 * 1024);

export class ProjectInfoServer extends EventEmitter {
  last?: ProjectInfo = undefined;
  private dbg: Function;
  private running = true;
  private readonly testing: boolean;
  private ticks: number;
  private pagesize: number;

  constructor(L, testing = false) {
    super();
    this.testing = testing;
    this.dbg = (...msg) => L("ProjectInfoServer", ...msg);
    if (!this.testing) this.start();
  }

  private async uptime(): Promise<[number, Date]> {
    // return uptime in secs
    const out = await readFile("/proc/uptime", "utf8");
    const uptime = parseFloat(out.split(" ")[0]);
    const boottime = new Date(new Date().getTime() - 1000 * uptime);
    return [uptime, boottime];
  }

  private async stat(path: string): Promise<Stat> {
    // all time-values are in seconds
    const raw = await readFile(path, "utf8");
    const [i, j] = [raw.indexOf("("), raw.lastIndexOf(")")];
    const start = raw.slice(0, i - 1).trim();
    const end = raw.slice(j + 1).trim();
    const data = `${start} comm ${end}`.split(" ");
    const get = (idx) => parseInt(data[idx]);
    // https://man7.org/linux/man-pages/man5/proc.5.html
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

  private cpu({ pid, stat, timestamp }): Cpu {
    // we are interested in that processes total usage: user + system
    const total_cpu = stat.utime + stat.stime;
    // the fallback is chosen in such a way, that it says 0% if we do not have historic data
    const prev_cpu = this.last?.processes[pid]?.cpu.secs ?? total_cpu;
    const dt = (timestamp - (this.last?.timestamp ?? 0)) / 1000;
    // how much cpu time was used since last time we checked this process…
    const pct = (total_cpu - prev_cpu) / dt;
    return { pct: pct, secs: total_cpu };
  }

  private async cmdline(path: string): Promise<string[]> {
    // we split at the null-delimiter and filter all empty elements
    return (await readFile(path, "utf8"))
      .split("\0")
      .filter((c) => c.length > 0);
  }

  private cocalc({ pid }): CoCalcInfo | undefined {
    //this.dbg("classify", { pid, exe, cmdline });
    if (pid === process.pid) {
      return { type: "project" };
    }
    const termpath = terminal_pid2path(pid);
    if (termpath != null) {
      this.dbg("cocalc terminal", termpath);
      return { type: "terminal", path: termpath };
    }
    const jupyterpath = get_kernel_by_pid(pid, this.dbg);
    this.dbg(jupyterpath);
  }

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
      cocalc: this.cocalc({ pid }),
    };
    return data;
  }

  private async processes({ timestamp, uptime }): Promise<Processes> {
    const procs: Processes = {};
    for (const pid of await readdir("/proc")) {
      if (!pid.match(/^[0-9]+$/)) continue;
      try {
        const proc = await this.process({ pid, uptime, timestamp });
        procs[proc.pid] = proc;
      } catch (err) {
        if (this.testing)
          this.dbg(`process ${pid} vanished – can happen – ${err}`);
      }
    }
    return procs;
  }

  private async cgroup(): Promise<CGroup | undefined> {
    if (!running_in_kucalc() && !this.testing) return;
    const [mem_stat_raw, cpu_raw, oom_raw] = await Promise.all([
      readFile("/sys/fs/cgroup/memory/memory.stat", "utf8"),
      readFile("/sys/fs/cgroup/cpu,cpuacct/cpuacct.usage", "utf8"),
      readFile("/sys/fs/cgroup/memory/memory.oom_control", "utf8"),
    ]);
    const mem_stat_keys = [
      "total_rss",
      "total_cache",
      "hierarchical_memory_limit",
    ];
    return {
      mem_stat: mem_stat_raw
        .split("\n")
        .map((line) => line.split(" "))
        .filter(([k, _]) => mem_stat_keys.includes(k))
        .reduce((stat, [key, val]) => {
          stat[key] = bytes2MiB(parseInt(val));
          return stat;
        }, {}),
      cpu_usage: parseFloat(cpu_raw) / Math.pow(10, 9),
      oom_kills: oom_raw
        .split("\n")
        .filter((val) => val.startsWith("oom_kill "))
        .map((val) => parseInt(val.slice("oom_kill ".length)))[0],
    };
  }

  private async df(): Promise<DF> {
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

  public new_listener(send_data) {
    if (this.last != null) send_data(this.last);
  }

  public stop() {
    this.running = false;
  }

  private async get_info(): Promise<ProjectInfo> {
    const [uptime, boottime] = await this.uptime();
    const timestamp = new Date().getTime();
    const [processes, cgroup, df] = await Promise.all([
      this.processes({ uptime, timestamp }),
      this.cgroup(),
      this.df(),
    ]);
    const info: ProjectInfo = {
      timestamp,
      processes,
      uptime,
      boottime,
      cgroup,
      df,
    };
    return info;
  }

  public async start() {
    await this.init();
    this.dbg("start");
    while (true) {
      // TODO disable info collection if there is nobody listening for a few minutes…
      this.dbg(`listeners on 'info': ${this.listenerCount("info")}`);
      const info = await this.get_info();
      this.last = info;
      this.emit("info", info);
      if (this.running) {
        await delay(1500);
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
  const pis = new ProjectInfoServer(console.log, true);
  pis.start().then(() => process.exit());
}
