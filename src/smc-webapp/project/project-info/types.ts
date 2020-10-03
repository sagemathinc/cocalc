/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { State } from "smc-project/project-info/types";

export interface PTStats {
  nprocs: number; // total number of processes
  threads: number; // total number of threads
}

export interface DUState {
  pct: number;
  usage: number;
  total: number;
}

// real-time info derived from the CGroup data
export interface CGroupInfo {
  mem_rss: number;
  mem_tot: number;
  cpu_pct: number;
  mem_pct: number;
  cpu_usage_rate: number;
  cpu_usage_limit: number;
}

// for the displayed Table, derived from "Process"
export interface ProcessRow {
  key: string; // pid, used in the Table
  pid: number;
  ppid: number;
  name: string;
  args: string;
  mem: number;
  state: State;
  cpu_tot: number;
  cpu_pct: number;
  cocalc?: CoCalcInfo;
  // pre-computed sum of children
  chldsum?: {
    mem: number;
    cpu_tot: number;
    cpu_pct: number;
  };
  children?: ProcessRow[];
}
