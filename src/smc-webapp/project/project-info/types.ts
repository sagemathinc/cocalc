/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface PTStats {
  nprocs: number; // total number of processes
  threads: number; // total number of threads
}

// for the displayed Table, derived from "Process"
export interface ProcessRow {
  key: string; // pid, used in the Table
  pid: number;
  ppid: number;
  name: string;
  args: string;
  mem: number;
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
