/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { parentPort } from "node:worker_threads";

import { scanProcessesSync } from "./process-stats-scan";
import type {
  WorkerScanError,
  WorkerScanRequest,
  WorkerScanResult,
} from "./process-stats-worker-types";

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
      timestamp: request.timestamp,
      sampleKey: request.sampleKey,
      procLimit: request.procLimit,
      ticks: request.ticks,
      pagesize: request.pagesize,
    });
    const response: WorkerScanResult = {
      type: "scanResult",
      requestId: request.requestId,
      ...result,
    };
    port.postMessage(response);
  } catch (err) {
    const response: WorkerScanError = {
      type: "scanError",
      requestId: request.requestId,
      error: err instanceof Error ? (err.stack ?? err.message) : String(err),
    };
    port.postMessage(response);
  }
});
