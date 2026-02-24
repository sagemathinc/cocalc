/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { Processes } from "@cocalc/util/types/project-info/types";

export interface WorkerScanRequest {
  type: "scan";
  requestId: number;
  timestamp: number;
  sampleKey: string;
  procLimit: number;
  ticks: number;
  pagesize: number;
}

export interface WorkerScanResult {
  type: "scanResult";
  requestId: number;
  procs: Processes;
  uptime: number;
  boottimeMs: number;
}

export interface WorkerScanError {
  type: "scanError";
  requestId: number;
  error: string;
}

export type WorkerResponse = WorkerScanResult | WorkerScanError;
