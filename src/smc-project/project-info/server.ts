/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Project information server, doing the heavy lifting
*/

import { delay } from "awaiting";
import { join } from "path";
import { exec as child_process_exec } from "child_process";
import { promisify } from "util";
const exec = promisify(child_process_exec);
import { promises as fsPromises } from "fs";
const { readFile, readdir, readlink } = fsPromises;
import { EventEmitter } from "events";
import { Cpu, Process, Processes, ProjectInfo, Stat, State } from "./types";

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

  private async uptime(): Promise<number> {
    // return uptime in secs
    const out = await readFile("/proc/uptime", "utf8");
    return parseFloat(out.split(" ")[0]);
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
      cpu: this.cpu({ pid, stat, timestamp }),
      uptime: uptime - stat.starttime,
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

  private async ps(): Promise<string> {
    try {
      const out = await exec("ps auxwwf");
      return out.stdout.trim();
    } catch (err) {
      return `Error -- ${err}`;
    }
  }

  public new_listener(send_data) {
    if (this.last != null) send_data(this.last);
  }

  public stop() {
    this.running = false;
  }

  private async get_info(): Promise<ProjectInfo> {
    const uptime = await this.uptime();
    const timestamp = new Date().getTime();
    const [ps, processes] = await Promise.all([
      this.ps(),
      this.processes({ uptime, timestamp }),
    ]);
    const info: ProjectInfo = {
      timestamp,
      ps,
      processes,
      uptime,
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
