/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
  pct: number;
  secs: number;
}

export interface Process {
  pid: number;
  ppid: number;
  exe: string; // full path of executable
  cmdline: string[]; // full command line
  stat: Stat;
  cpu: Cpu;
  uptime: number;
  //  mem: number;
}

export type Processes = { [pid: number]: Process };

export interface ProjectInfo {
  timestamp: number;
  ps: string;
  processes: Processes;
  uptime: number; // secs
}

interface KillCmd {
  cmd: "kill";
  pid: number;
}

export type ProjectInfoCmds = KillCmd;
