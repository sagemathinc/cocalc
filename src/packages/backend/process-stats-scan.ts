/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";

import type {
  Cpu,
  Process,
  Processes,
  Stat,
  State,
} from "@cocalc/util/types/project-info/types";
import { getLogger } from "./logger";

export interface ScanProcessesSyncInput {
  timestamp: number;
  sampleKey: string;
  procLimit: number;
  ticks: number;
  pagesize: number;
}

export interface ScanProcessesSyncResult {
  procs: Processes;
  uptime: number;
  boottimeMs: number;
}

const lastByKey = new Map<
  string,
  { timestamp: number; cpuByPid: Map<number, number> }
>();
const dbg = getLogger("process-stats").debug;

function parseStat(path: string, ticks: number, pagesize: number): Stat {
  // all time-values are in seconds
  const raw = readFileSync(path, "utf8");
  // the "comm" field could contain additional spaces or parents
  const [i, j] = [raw.indexOf("("), raw.lastIndexOf(")")];
  const start = raw.slice(0, i - 1).trim();
  const end = raw.slice(j + 1).trim();
  const data = `${start} comm ${end}`.split(" ");
  const get = (idx: number) => parseInt(data[idx], 10);
  // "comm" is now a placeholder to keep indices as they are.
  // don't forget to account for 0 vs. 1 based indexing.
  return {
    ppid: get(3),
    state: data[2] as State,
    utime: get(13) / ticks, // CPU time spent in user code, measured in clock ticks (#14)
    stime: get(14) / ticks, // CPU time spent in kernel code, measured in clock ticks (#15)
    cutime: get(15) / ticks, // Waited-for children's CPU time spent in user code (in clock ticks) (#16)
    cstime: get(16) / ticks, // Waited-for children's CPU time spent in kernel code (in clock ticks) (#17)
    starttime: get(21) / ticks, // Time when the process started, measured in clock ticks (#22)
    nice: get(18),
    num_threads: get(19),
    mem: { rss: (get(23) * pagesize) / (1024 * 1024) }, // MiB
  };
}

function getCmdline(path: string): string[] {
  // we split at the null-delimiter and filter all empty elements
  return readFileSync(path, "utf8")
    .split("\0")
    .filter((c) => c.length > 0);
}

function getCpu({
  pid,
  stat,
  timestamp,
  lastCpuByPid,
  lastTimestamp,
}: {
  pid: number;
  stat: Stat;
  timestamp: number;
  lastCpuByPid?: Map<number, number>;
  lastTimestamp?: number;
}): Cpu {
  // we are interested in that processes total usage: user + system
  const totalCpu = stat.utime + stat.stime;
  // the fallback is chosen in such a way, that it says 0% if we do not have historic data
  const prevCpu = lastCpuByPid?.get(pid) ?? totalCpu;
  const dt = (timestamp - (lastTimestamp ?? 0)) / 1000;
  // how much cpu time was used since last time we checked this process…
  const pct = dt > 0 ? 100 * ((totalCpu - prevCpu) / dt) : 0;
  return { pct: pct, secs: totalCpu };
}

function readUptime(timestamp: number): [number, number] {
  const out = readFileSync("/proc/uptime", "utf8");
  const uptime = parseFloat(out.split(" ")[0]);
  const boottimeMs = timestamp - 1000 * uptime;
  return [uptime, boottimeMs];
}

export function scanProcessesSync({
  timestamp,
  sampleKey,
  procLimit,
  ticks,
  pagesize,
}: ScanProcessesSyncInput): ScanProcessesSyncResult {
  const sampleTimestamp = timestamp;
  const [uptime, boottimeMs] = readUptime(sampleTimestamp);
  const last = lastByKey.get(sampleKey);
  const cpuByPid = new Map<number, number>();

  const procs: Processes = {};
  let pids = readdirSync("/proc").filter((pid) => pid.match(/^[0-9]+$/));
  if (pids.length > procLimit) {
    dbg(`too many processes (${pids.length}), truncating scan to ${procLimit}`);
    pids = pids.slice(0, procLimit);
  }

  for (const pidStr of pids) {
    const base = join("/proc", pidStr);
    const fn = (name: string) => join(base, name);
    try {
      const pid = parseInt(pidStr, 10);
      const stat = parseStat(fn("stat"), ticks, pagesize);
      const proc: Process = {
        pid,
        ppid: stat.ppid,
        cmdline: getCmdline(fn("cmdline")),
        exe: readlinkSync(fn("exe")),
        stat,
        cpu: getCpu({
          pid,
          timestamp: sampleTimestamp,
          stat,
          lastCpuByPid: last?.cpuByPid,
          lastTimestamp: last?.timestamp,
        }),
        uptime: uptime - stat.starttime,
      };
      procs[proc.pid] = proc;
      cpuByPid.set(proc.pid, proc.cpu.secs);
    } catch {
      // Processes can vanish while scanning /proc, which is expected.
    }
  }

  lastByKey.set(sampleKey, { timestamp: sampleTimestamp, cpuByPid });

  return {
    procs,
    uptime,
    boottimeMs,
  };
}
