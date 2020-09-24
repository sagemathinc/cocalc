/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

type ProcessCategory = "hub" | "jupyter" | "sage" | "other";

interface Process {
  pid: number;
  ppid: number;
  cmd: string;
  args: string[];
  category: ProcessCategory;
  cpu: number;
  mem: number;
}

export type Processes = Process[];

export interface ProjectInfo {
  timestamp: number;
  ps: string;
  processes: Processes;
}

interface KillCmd {
  cmd: "kill";
  pid: number;
}

export type ProjectInfoCmds = KillCmd;
