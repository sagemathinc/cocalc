/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// ATTN: all this is also used by the webapp client. Hence, make sure it is kept free of project code.

export type State = "R" | "S" | "D" | "Z" | "T" | "W";

export interface Mem {
  rss: number; // MiB
}

export interface Stat {
  ppid: number;
  state: State;
  utime: number; // CPU time spent in user code, measured in clock ticks (#14)
  stime: number; // CPU time spent in kernel code, measured in clock ticks (#15)
  cutime: number; // Waited-for children's CPU time spent in user code (in clock ticks) (#16)
  cstime: number; // Waited-for children's CPU time spent in kernel code (in clock ticks) (#17)
  starttime: number; // Time when the process started, measured in clock ticks (#22)
  nice: number;
  num_threads: number;
  mem: Mem;
}

export interface Cpu {
  pct: number; // 0 to 100 (1 core) or more
  secs: number;
}

// additional CoCalc specific information for a process
interface ProcProject {
  type: "project";
}

interface ProcTerminal {
  type: "terminal";
  path: string; // name is "terminal:${path}"
}

interface ProcJupyter {
  type: "jupyter";
  path: string;
}

interface ProcX11 {
  type: "x11";
  path: string;
}

interface ProcSSHD {
  type: "sshd";
}

export type CoCalcInfo =
  | ProcTerminal
  | ProcJupyter
  | ProcProject
  | ProcSSHD
  | ProcX11;

export interface Process {
  pid: number;
  ppid: number;
  exe: string; // full path of executable
  cmdline: string[]; // full command line
  stat: Stat;
  cpu: Cpu;
  uptime: number;
  // additional CoCalc specific information
  cocalc?: CoCalcInfo;
}

export interface CGroup {
  mem_stat: {
    [key: string]: number; // MiB
  };
  cpu_usage: number; // seconds
  cpu_usage_rate: number; // seconds / second
  oom_kills: number;
  cpu_cores_limit: number; // cpu cores quota limit, the overall time slices it can get
}

export interface DiskUsageInfo {
  available: number; // MiB
  free: number; // MiB
  total: number; // MiB
  usage: number; // MiB (total - free)
}

export type DiskUsage = Record<"tmp" | "project", DiskUsageInfo>;

export type Processes = { [pid: string]: Process };

export interface ProjectInfo {
  timestamp: number;
  processes?: Processes;
  cgroup?: CGroup; // only in "kucalc" mode
  disk_usage: DiskUsage;
  uptime: number; // secs, uptime of the machine
  boottime: Date; // when VM booted (might be derived from uptime)
}

export enum Signal {
  Kill = 9,
  Interrupt = 2,
  Terminate = 15,
  Pause = 19,
  Resume = 18,
}

interface SignalCmd {
  cmd: "signal";
  signal?: Signal;
  pids: number[];
}

export type ProjectInfoCmds = SignalCmd;
