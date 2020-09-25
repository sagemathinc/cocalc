/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ProcessDescriptor } from "ps-list";

type ProcessCategory = "hub" | "jupyter" | "sage" | "other";

//  to match ps-list or whatever tool we're using
type Process = ProcessDescriptor;

//interface Process {
//  pid: number;
//  ppid: number;
//  cmd: string;
//  args: string[];
//  category: ProcessCategory;
//  cpu: number;
//  mem: number;
//}

export type Processes = Process[];

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
