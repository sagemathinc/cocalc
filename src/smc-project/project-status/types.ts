/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface DiskAlert {
  type: "disk";
}
export interface MemoryAlert {
  type: "memory";
}
export interface CPUAlert {
  type: "cpu";
}

export type Alert = DiskAlert | MemoryAlert | CPUAlert;

export interface ProjectStatus {
  timestamp: number;
  version: number;
  alerts: Alert[];
}
