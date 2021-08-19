/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface DiskAlert {
  type: "disk";
}

// entire container
export interface MemoryAlert {
  type: "memory";
}

// CPU alerts for individual processes
export interface CPUProcAlert {
  type: "cpu-process";
  pids: string[]; // list of PIDs
}

// this is for the entire Container
export interface CPUCGAlert {
  type: "cpu-cgroup";
}

export type Alert = DiskAlert | MemoryAlert | CPUProcAlert | CPUCGAlert;

export type AlertType = Alert["type"];

export interface ProjectStatus {
  version: number;
  alerts: Alert[];
}
