/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Project information server, doing the heavy lifting of telling the client
about what's going on in a project.

This is an event emitter that emits a ProjectInfo object periodically when running.

One important aspect is that this avoids spawning subprocesses, which could be problematic
if there is a limit on the number of processes that can be spawned, or memory pressure, etc.
*/

import { delay } from "awaiting";
import type { DiskUsage as DF_DiskUsage } from "diskusage";
import { check as df } from "diskusage";
import { EventEmitter } from "node:events";
import { access, readFile } from "node:fs/promises";

import { ProcessStats } from "@cocalc/backend/process-stats";
import { pidToPath as terminalPidToPath } from "@cocalc/project/conat/terminal/manager";
import { getLogger } from "@cocalc/project/logger";
import { get_path_for_pid as x11_pid2path } from "@cocalc/project/x11/server";
import type {
  CGroup,
  CoCalcInfo,
  DiskUsage,
  Process,
  Processes,
  ProjectInfo,
} from "@cocalc/util/types/project-info/types";

const L = getLogger("project-info:server").debug;

const bytes2MiB = (bytes) => bytes / (1024 * 1024);

/**
 * Detect if /tmp is mounted as tmpfs (memory-based filesystem) by reading /proc/mounts.
 * Returns true if /tmp is tmpfs, false otherwise.
 */
async function isTmpMemoryBased(): Promise<boolean> {
  try {
    const mounts = await readFile("/proc/mounts", "utf8");
    // Look for lines like: "tmpfs /tmp tmpfs rw,nosuid,nodev,noexec,relatime,size=1024000k 0 0"
    const tmpfsPattern = /^\S+\s+\/tmp\s+tmpfs\s/m;
    return tmpfsPattern.test(mounts);
  } catch (error) {
    L("Failed to read /proc/mounts, assuming /tmp is disk-based:", error);
    return false; // Default to safer assumption for development environments
  }
}

/**
 * Safely read a file, returning null if the file doesn't exist.
 * Throws for other errors.
 */
async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.warn(`safeReadFile: ${path} not found, skipping`);
      return null;
    }
    throw error;
  }
}

export class ProjectInfoServer extends EventEmitter {
  private last?: ProjectInfo = undefined;
  private readonly dbg: Function;
  private running = false;
  private readonly testing: boolean;
  private delay_s: number;
  private tmpIsMemoryBased?: boolean;
  private cgroupFilesAreMissing: boolean = false;
  private processStats: ProcessStats;
  private cgroupVersion: "v1" | "v2" | "unknown" | null;

  constructor(testing = false) {
    super();
    this.delay_s = 2;
    this.testing = testing;
    this.dbg = L;
    // cgroup version will be detected lazily
    this.cgroupVersion = null;
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

  /**
   * Detect cgroup version lazily.
   * Fine to run once, since the cgroup version won't change during the process lifetime.
   */
  private async detectCGroupVersion(): Promise<"v1" | "v2" | "unknown" | null> {
    if (this.cgroupVersion !== null) {
      return this.cgroupVersion;
    }

    try {
      // Check for v2-specific file
      await access("/sys/fs/cgroup/cgroup.controllers");
      this.cgroupVersion = "v2";
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // File doesn't exist, so likely v1
        this.cgroupVersion = "v1";
      } else {
        // Other errors (e.g., permissions): treat as unknown
        console.error("Error detecting cgroup version:", error);
        this.cgroupVersion = "unknown";
      }
    }

    L(`detected cgroup version: ${this.cgroupVersion}`);
    return this.cgroupVersion;
  }

  /**
   * Collect cgroup resource usage information.
   * This is specific to running a project in a CGroup container.
   * Harald: however, even without a container this shouldn't fail … just tells
   * you what the whole system is doing, all your processes.
   * William: it's constantly failing in cocalc-docker every second, so to avoid
   * clogging logs and wasting CPU, if the files are missing once, it stops updating.
   */
  private async cgroup({ timestamp }): Promise<CGroup | undefined> {
    const version = await this.detectCGroupVersion();
    switch (version) {
      case "v1":
        return this.cgroupV1({ timestamp });
      case "v2":
        return this.cgroupV2({ timestamp });
      default:
        this.dbg("cgroup: unknown version, skipping");
        return undefined;
    }
  }

  /**
   * Collect cgroup v1 resource usage information.
   *
   * cgroup v1 uses separate hierarchies for different resource controllers:
   * - /sys/fs/cgroup/memory/memory.stat - memory statistics
   * - /sys/fs/cgroup/cpu,cpuacct/cpuacct.usage - CPU usage in nanoseconds
   * - /sys/fs/cgroup/memory/memory.oom_control - OOM kill information
   * - /sys/fs/cgroup/cpu,cpuacct/cpu.cfs_quota_us - CPU quota
   * - /sys/fs/cgroup/cpu,cpuacct/cpu.cfs_period_us - CPU period
   */
  private async cgroupV1({ timestamp }): Promise<CGroup | undefined> {
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

      // Handle unlimited CPU quota (-1) correctly
      const cpu_cores_limit = cfs_quota === -1 ? -1 : cfs_quota / cfs_period;

      return {
        mem_stat,
        cpu_usage,
        cpu_usage_rate,
        cpu_cores_limit,
        oom_kills,
      };
    } catch (err) {
      this.dbg("cgroup v1: error", err);
      if (err.code == "ENOENT") {
        // TODO: instead of shutting this down, we could maybe do a better job
        // figuring out what the correct cgroups files are on a given system.
        // E.g., in my cocalc-docker, I do NOT have /sys/fs/cgroup/memory/memory.stat
        // but I do have /sys/fs/cgroup/memory.stat
        this.cgroupFilesAreMissing = true;
        this.dbg(
          "cgroup v1: files are missing so cgroups info will no longer be updated",
        );
      }
      return undefined;
    }
  }

  /**
   * Get the current process's cgroup path for v2.
   */
  private async getCgroupV2Path(): Promise<string> {
    try {
      const cgroupData = await readFile("/proc/self/cgroup", "utf8");
      // v2 format: "0::/path/to/cgroup"
      const match = cgroupData.match(/^0::(.+)$/m);
      if (match) {
        return `/sys/fs/cgroup${match[1]}`;
      }
    } catch (error) {
      console.warn("Failed to read /proc/self/cgroup, using root cgroup");
    }
    return "/sys/fs/cgroup";
  }

  /**
   * Get system total memory from /proc/meminfo as fallback.
   */
  private async getSystemTotalMemory(): Promise<number> {
    try {
      const meminfo = await safeReadFile("/proc/meminfo");
      if (meminfo) {
        const match = meminfo.match(/^MemTotal:\s+(\d+)\s+kB$/m);
        if (match) {
          return parseInt(match[1]) / 1024; // Convert kB to MiB
        }
      }
    } catch (error) {
      console.warn("Failed to read system memory info:", error);
    }
    return -1; // Fallback to unlimited if can't read
  }

  /**
   * Get system CPU core count from /proc/cpuinfo as fallback.
   */
  private async getSystemCpuCores(): Promise<number> {
    try {
      const cpuinfo = await safeReadFile("/proc/cpuinfo");
      if (cpuinfo) {
        const processors = cpuinfo.match(/^processor\s*:/gm);
        return processors ? processors.length : -1;
      }
    } catch (error) {
      console.warn("Failed to read system CPU info:", error);
    }
    return -1; // Fallback to unlimited if can't read
  }

  /**
   * Collect cgroup v2 resource usage information.
   *
   * cgroup v2 uses a unified hierarchy with process-specific paths:
   * - {cgroup_path}/memory.stat - comprehensive memory statistics
   * - {cgroup_path}/cpu.stat - CPU usage statistics in microseconds
   * - {cgroup_path}/memory.events - memory events including OOM kills
   * - {cgroup_path}/cpu.max - CPU limits in "quota period" format
   * - {cgroup_path}/memory.max - memory limit in bytes or "max"
   *
   * Memory stat mapping from v2 to v1 equivalent:
   * - anon: Anonymous memory (private memory, roughly equivalent to v1 total_rss)
   * - file: Page cache memory (file-backed memory)
   * - kernel: Kernel memory usage
   * - slab: Kernel slab memory (reclaimable + unreclaimable)
   * - total_cache equivalent: file + slab (approximates v1 cached memory)
   *
   * ## Testing different cgroup environments
   *
   * ### Container with limits (CoCalc production scenario):
   * ```bash
   * # Test memory and CPU limits
   * docker run --rm --memory=512m --cpus=0.5 ubuntu:24.04 sh -c "
   *   cat /proc/self/cgroup                 # Shows: 0::/
   *   cat /sys/fs/cgroup/memory.max         # Shows: 536870912 (512MB in bytes)
   *   cat /sys/fs/cgroup/cpu.max            # Shows: 50000 100000 (0.5 cores)
   *   cat /sys/fs/cgroup/memory.events      # Shows: low 0, high 0, max 0, oom 0, oom_kill 0, oom_group_kill 0
   * "
   * ```
   *
   * ### Container without limits:
   * ```bash
   * docker run --rm ubuntu:24.04 sh -c "
   *   cat /proc/self/cgroup                 # Shows: 0::/
   *   cat /sys/fs/cgroup/memory.max         # Shows: max
   *   cat /sys/fs/cgroup/cpu.max            # Shows: max 100000
   * "
   * ```
   *
   * ### Host system (development environment):
   * ```bash
   * cat /proc/self/cgroup                   # Shows: 0::/user.slice/user-1000.slice/...
   * # Files exist in /sys/fs/cgroup/user.slice/... but typically show unlimited values
   * # System fallback examples:
   * cat /proc/meminfo | head -1             # MemTotal: 32585044 kB
   * grep -c "^processor" /proc/cpuinfo      # 8 (CPU cores)
   * ```
   *
   * Expected file formats:
   * - memory.max: "536870912" (bytes) or "max" (unlimited)
   * - cpu.max: "50000 100000" (quota period) or "max 100000" (unlimited)
   * - memory.events: "low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\noom_group_kill 0"
   * - cpu.stat: "usage_usec 1234567\n..." (usage in microseconds)
   * - memory.stat: "anon 12345\nfile 67890\nkernel 111\nslab 222\n..." (values in bytes)
   */
  private async cgroupV2({ timestamp }): Promise<CGroup | undefined> {
    if (this.cgroupFilesAreMissing) {
      return;
    }
    try {
      const cgroupPath = await this.getCgroupV2Path();

      const [
        mem_stat_raw,
        cpu_stat_raw,
        mem_events_raw,
        cpu_max_raw,
        mem_max_raw,
      ] = await Promise.all([
        safeReadFile(`${cgroupPath}/memory.stat`),
        safeReadFile(`${cgroupPath}/cpu.stat`),
        safeReadFile(`${cgroupPath}/memory.events`),
        safeReadFile(`${cgroupPath}/cpu.max`),
        safeReadFile(`${cgroupPath}/memory.max`),
      ]);

      // Parse memory.stat - extract key memory statistics
      // These keys provide the most relevant memory usage information
      const mem_stat_keys = ["anon", "file", "kernel", "slab"];
      const mem_stat = mem_stat_raw
        ? mem_stat_raw
            .split("\n")
            .map((line) => line.split(" "))
            .filter(([k, _]) => mem_stat_keys.includes(k))
            .reduce((stat, [key, val]) => {
              stat[key] = bytes2MiB(parseInt(val));
              return stat;
            }, {})
        : {};

      // For compatibility with v1 interface, map v2 stats to v1 equivalents:
      // - total_rss: Anonymous memory (private/process memory)
      mem_stat["total_rss"] = mem_stat["anon"] || 0;
      // - total_cache: File cache + kernel slab memory (shared/cached memory)
      mem_stat["total_cache"] =
        (mem_stat["file"] || 0) + (mem_stat["slab"] || 0);

      // - hierarchical_memory_limit: Memory limit from memory.max, with system fallback
      const mem_max_value = mem_max_raw?.trim();
      if (mem_max_value === "max" || !mem_max_value) {
        // Use system total memory as fallback when cgroup limit is unlimited
        mem_stat["hierarchical_memory_limit"] =
          await this.getSystemTotalMemory();
      } else {
        mem_stat["hierarchical_memory_limit"] = bytes2MiB(
          parseInt(mem_max_value),
        );
      }

      // Parse cpu.stat - extract CPU usage in microseconds, convert to seconds
      // v2 provides usage_usec (microseconds) vs v1 which provides nanoseconds
      const cpu_usage_match = cpu_stat_raw?.match(/usage_usec (\d+)/);
      const cpu_usage = cpu_usage_match
        ? parseFloat(cpu_usage_match[1]) / 1000000
        : 0;

      // Calculate CPU usage rate
      const dt = this.dt(timestamp);
      const cpu_usage_rate =
        this.last?.cgroup != null
          ? (cpu_usage - this.last.cgroup.cpu_usage) / dt
          : 0;

      // Parse memory.events for OOM kills
      const oom_kill_match = mem_events_raw?.match(/oom_kill (\d+)/);
      const oom_kills = oom_kill_match ? parseInt(oom_kill_match[1]) : 0;

      // Parse cpu.max for CPU limit, with system fallback
      // v2 format: "quota period" (e.g., "50000 100000" = 0.5 cores) or "max" for unlimited
      // v1 uses separate files: cpu.cfs_quota_us and cpu.cfs_period_us
      const cpu_max_parts = cpu_max_raw?.trim().split(" ");
      let cpu_cores_limit = -1; // -1 indicates unlimited
      if (
        cpu_max_parts &&
        cpu_max_parts[0] !== "max" &&
        cpu_max_parts.length >= 2
      ) {
        const quota = parseInt(cpu_max_parts[0]);
        const period = parseInt(cpu_max_parts[1]);
        cpu_cores_limit = quota / period;
      } else {
        // Use system CPU core count as fallback when cgroup limit is unlimited
        cpu_cores_limit = await this.getSystemCpuCores();
      }

      return {
        mem_stat,
        cpu_usage,
        cpu_usage_rate,
        cpu_cores_limit,
        oom_kills,
      };
    } catch (err) {
      this.dbg("cgroupV2: error", err);
      if (err.code == "ENOENT") {
        // Mark files as missing to avoid repeated failed attempts
        this.cgroupFilesAreMissing = true;
        this.dbg(
          "cgroupV2: files are missing so cgroups info will no longer be updated",
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

    const tmpData = convert(tmp);

    // If /tmp is not tmpfs (memory-based), don't count its disk usage toward memory
    // since cgroup_stats adds disk_usage.tmp.usage to memory calculations
    if (this.tmpIsMemoryBased === false) {
      tmpData.usage = 0;
    }

    return { tmp: tmpData, project: convert(project) };
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

  close = () => {
    this.stop();
  };

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

    // Initialize tmpfs detection once at startup
    this.tmpIsMemoryBased = await isTmpMemoryBased();
    this.running = true;
    this.processStats = ProcessStats.getInstance();
    if (this.testing) {
      this.processStats.setTesting(true);
    }
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
