/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { parentPort } from "node:worker_threads";

import { scanProcessesSync } from "./process-stats-scan";

interface WorkerScanRequest {
  type: "scan";
  requestId: number;
  timestamp: number;
  sampleKey: string;
  procLimit: number;
  ticks: number;
  pagesize: number;
  testing: boolean;
}

interface WorkerScanError {
  type: "scanError";
  requestId: number;
  error: string;
}

const port = parentPort;
if (port == null) {
  throw Error("process-stats.worker must run as a worker thread");
}

port.on("message", (request: WorkerScanRequest) => {
  if (request?.type !== "scan") {
    return;
  }
  try {
    const result = scanProcessesSync({
      sampleKey: request.sampleKey,
      procLimit: request.procLimit,
      ticks: request.ticks,
      pagesize: request.pagesize,
      testing: request.testing,
    });
    port.postMessage({
      type: "scanResult",
      requestId: request.requestId,
      ...result,
    });
  } catch (err) {
    const response: WorkerScanError = {
      type: "scanError",
      requestId: request.requestId,
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    };
    port.postMessage(response);
  }
});
