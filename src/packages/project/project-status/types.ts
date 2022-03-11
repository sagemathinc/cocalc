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

// a functional component of the project. add it to the list if it is currently defunct.
export type ComponentName = "BlobStore";
export interface Component {
  type: "component";
  names: ComponentName[];
}

export type Alert =
  | DiskAlert
  | MemoryAlert
  | CPUProcAlert
  | CPUCGAlert
  | Component;

export type AlertType = Alert["type"];

export interface ProjectStatus {
  version: number;
  alerts: Alert[];
  usage: {
    disk_mb?: number;
    mem_pct?: number; // 0-100%
    cpu_pct?: number;
    cpu_tot?: number; // in seconds
    mem_rss?: number; // mb
  };
}
