/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Project information server, doing the heavy lifting of telling the client
about what's going on in a project.
*/

import { delay } from "awaiting";
import type { DiskUsage as DF_DiskUsage } from "diskusage";
import { check as df } from "diskusage";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { ProcessStats } from "@cocalc/backend/process-stats";
import { pidToPath as terminalPidToPath } from "@cocalc/terminal";
import {
  CGroup,
  CoCalcInfo,
  DiskUsage,
  Process,
  Processes,
  ProjectInfo,
} from "@cocalc/util/types/project-info/types";
import { get_path_for_pid as x11_pid2path } from "../x11/server";
//import { get_sage_path } from "../sage_session"
import { getLogger } from "../logger";

const L = getLogger("project-info:server").debug;

// function is_in_dev_project() {
//   return process.env.SMC_LOCAL_HUB_HOME != null;
// }

const bytes2MiB = (bytes) => bytes / (1024 * 1024);

export class ProjectInfoServer extends EventEmitter {
  private last?: ProjectInfo = undefined;
  private readonly dbg: Function;
  private running = false;
  private readonly testing: boolean;
  private delay_s: number;
  private cgroupFilesAreMissing: boolean = false;
  private processStats: ProcessStats;

  constructor(testing = false) {
    super();
    this.delay_s = 2;
    this.testing = testing;
    this.dbg = L;
  }

  private async processes(timestamp: number) {
    return await this.processStats.processes(timestamp);
  }

  // delta-time for this and the previous process information
  private dt(timestamp) {
    return (timestamp - (this.last?.timestamp ?? 0)) / 1000;
  }

  public latest(): ProjectInfo | undefined {
    return this.last;
  }

  // for a process we know (pid, etc.) we try to map to cocalc specific information
  private async cocalc({
    pid,
    cmdline,
  }: Pick<Process, "pid" | "cmdline">): Promise<CoCalcInfo | undefined> {
    //this.dbg("classify", { pid, exe, cmdline });
    if (pid === process.pid) {
      return { type: "project" };
    }
    // SPEED: importing @cocalc/jupyter/kernel is slow, so it MUST NOT BE DONE
    // on the top level, especially not in any code that is loaded during
    // project startup
    const { get_kernel_by_pid } = await import("@cocalc/jupyter/kernel");
    const jupyter_kernel = get_kernel_by_pid(pid);
    if (jupyter_kernel != null) {
      return { type: "jupyter", path: jupyter_kernel.get_path() };
    }
    const termpath = terminalPidToPath(pid);
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

  private async lookupCoCalcInfo(processes: Processes) {
    // iterate over all processes keys (pid) and call this.cocalc({pid, cmdline})
    // to update the processes coclc field
    for (const pid in processes) {
      processes[pid].cocalc = await this.cocalc({
        pid: parseInt(pid),
        cmdline: processes[pid].cmdline,
      });
    }
  }

  // this is specific to running a project in a CGroup container
  // Harald: however, even without a container this shouldn't fail … just tells
  // you what the whole system is doing, all your processes.
  // William: it's constantly failing in cocalc-docker every second, so to avoid
  // clogging logs and wasting CPU, if the files are missing once, it stops updating.
  private async cgroup({ timestamp }): Promise<CGroup | undefined> {
    if (this.cgroupFilesAreMissing) {
      return;
    }
    try {
      const [mem_stat_raw, cpu_raw, oom_raw, cfs_quota_raw, cfs_period_raw] =
        await Promise.all([
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
    } catch (err) {
      this.dbg("cgroup: error", err);
      if (err.code == "ENOENT") {
        // TODO: instead of shutting this down, we could maybe do a better job
        // figuring out what the correct cgroups files are on a given system.
        // E.g., in my cocalc-docker, I do NOT have /sys/fs/cgroup/memory/memory.stat
        // but I do have /sys/fs/cgroup/memory.stat
        this.cgroupFilesAreMissing = true;
        this.dbg(
          "cgroup: files are missing so cgroups info will no longer be updated",
        );
      }
      return undefined;
    }
  }

  // for cocalc/kucalc we want to know the disk usage + limits of the
  // users home dir and /tmp. /tmp is a ram disk, which will count against
  // the overall memory limit!
  private async disk_usage(): Promise<DiskUsage> {
    const convert = function (val: DF_DiskUsage) {
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

  // orchestrating where all the information is bundled up for an update
  private async get_info(): Promise<ProjectInfo | undefined> {
    try {
      const timestamp = Date.now();
      const [processes, cgroup, disk_usage] = await Promise.all([
        this.processes(timestamp),
        this.cgroup({ timestamp }),
        this.disk_usage(),
      ]);
      const { procs, boottime, uptime } = processes;
      await this.lookupCoCalcInfo(procs);
      const info: ProjectInfo = {
        timestamp,
        processes: procs,
        uptime,
        boottime,
        cgroup,
        disk_usage,
      };
      return info;
    } catch (err) {
      this.dbg("get_info: error", err);
    }
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
    this.processStats = new ProcessStats({
      testing: this.testing,
      dbg: this.dbg,
    });
    await this.processStats.init();
    while (true) {
      //this.dbg(`listeners on 'info': ${this.listenerCount("info")}`);
      const info = await this.get_info();
      if (info != null) this.last = info;
      this.emit("info", info ?? this.last);
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
