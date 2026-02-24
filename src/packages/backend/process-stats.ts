/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { exec as cp_exec } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { Worker } from "node:worker_threads";

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { Processes } from "@cocalc/util/types/project-info/types";
import { getLogger } from "./logger";
import { envToInt } from "./misc/env-to-number";
import { scanProcessesSync } from "./process-stats-scan";
import type {
  WorkerResponse,
  WorkerScanRequest,
} from "./process-stats-worker-types";

const dbg = getLogger("process-stats").debug;

const exec = promisify(cp_exec);

/**
 * Return information about all processes (up to a limit or filter) in the environment, where this node.js process runs.
 * This has been refactored out of project/project-info/server.ts.
 * It is also used by the backend itself in "execute-code.ts" – to gather info about a spawned async process.
 */

// this is a hard limit on the number of processes we gather, just to
// be on the safe side to avoid processing too much data.
const LIMIT = envToInt("COCALC_PROJECT_INFO_PROC_LIMIT", 1024);
const SCAN_TIMEOUT_MS = envToInt(
  "COCALC_PROJECT_INFO_PROC_SCAN_TIMEOUT_MS",
  15000,
);

interface PendingRequest {
  timeout: ReturnType<typeof setTimeout>;
  resolve: (value: {
    procs: Processes;
    uptime: number;
    boottime: Date;
  }) => void;
  reject: (reason?: any) => void;
}

export class ProcessStats {
  private static instance: ProcessStats;

  private readonly procLimit: number;

  private testing = false;
  private ticks = 0;
  private pagesize = 0;
  private worker: Worker | undefined;
  private useInlineScan = false;
  private pending = new Map<number, PendingRequest>();
  private requestId = 0;

  private constructor() {
    this.procLimit = LIMIT;
    this.init();
    process.once("exit", () => {
      if (this.worker != null) {
        void this.worker.terminate();
        this.worker = undefined;
      }
    });
  }

  public static getInstance(): ProcessStats {
    if (!ProcessStats.instance) {
      ProcessStats.instance = new ProcessStats();
    }
    return ProcessStats.instance;
  }

  public setTesting(testing: boolean): void {
    this.testing = testing;
  }

  // this grabs some kernel configuration values we need. they won't change
  public init = reuseInFlight(async () => {
    if (this.ticks === 0 || this.pagesize === 0) {
      const [p_ticks, p_pagesize] = await Promise.all([
        exec("getconf CLK_TCK"),
        exec("getconf PAGESIZE"),
      ]);
      // should be 100, usually
      this.ticks = parseInt(p_ticks.stdout.trim(), 10);
      // 4096?
      this.pagesize = parseInt(p_pagesize.stdout.trim(), 10);
    }
  });

  private ensureWorker(): Worker | null {
    if (this.useInlineScan) {
      return null;
    }
    if (this.worker != null) {
      return this.worker;
    }
    const workerPath = join(__dirname, "process-stats.worker.js");
    if (!existsSync(workerPath)) {
      dbg(
        `process-stats worker script missing at ${workerPath}; using inline scanner`,
      );
      this.useInlineScan = true;
      return null;
    }
    const worker = new Worker(workerPath);
    worker.unref();
    worker.on("message", (msg) =>
      this.handleWorkerMessage(msg as WorkerResponse),
    );
    worker.on("error", (err) => {
      dbg(`process-stats worker error -- ${err}`);
      this.rejectAllPending(err);
      this.worker = undefined;
    });
    worker.on("exit", (code) => {
      if (code !== 0) {
        dbg(`process-stats worker exited with code ${code}`);
      }
      this.rejectAllPending(
        Error(
          `process-stats worker exited while handling requests (code ${code})`,
        ),
      );
      this.worker = undefined;
    });
    this.worker = worker;
    return worker;
  }

  private handleWorkerMessage(msg: WorkerResponse): void {
    const pending = this.pending.get(msg.requestId);
    if (pending == null) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(msg.requestId);
    if (msg.type === "scanError") {
      pending.reject(Error(msg.error));
      return;
    }
    pending.resolve({
      procs: msg.procs,
      uptime: msg.uptime,
      boottime: new Date(msg.boottimeMs),
    });
  }

  private rejectAllPending(err: unknown): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(err);
    }
    this.pending.clear();
  }

  // this is where we gather information about all running processes
  public async processes(
    timestamp?: number,
    sampleKey = "default",
  ): Promise<{ procs: Processes; uptime: number; boottime: Date }> {
    timestamp ??= Date.now();
    await this.init();

    const requestId = ++this.requestId;
    const request: WorkerScanRequest = {
      type: "scan",
      requestId,
      timestamp,
      sampleKey,
      procLimit: this.procLimit,
      ticks: this.ticks,
      pagesize: this.pagesize,
    };

    const worker = this.ensureWorker();
    if (worker == null) {
      const result = scanProcessesSync({
        timestamp,
        sampleKey,
        procLimit: this.procLimit,
        ticks: this.ticks,
        pagesize: this.pagesize,
      });
      return {
        procs: result.procs,
        uptime: result.uptime,
        boottime: new Date(result.boottimeMs),
      };
    }
    return await new Promise((resolve, reject) => {
      const timeoutMs = this.testing ? 4 * SCAN_TIMEOUT_MS : SCAN_TIMEOUT_MS;
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          Error(`process-stats worker scan timed out after ${timeoutMs}ms`),
        );
        if (this.worker != null) {
          void this.worker.terminate();
        }
      }, timeoutMs);
      this.pending.set(requestId, { timeout, resolve, reject });
      try {
        worker.postMessage(request);
      } catch (err) {
        const pending = this.pending.get(requestId);
        if (pending != null) {
          clearTimeout(pending.timeout);
        }
        this.pending.delete(requestId);
        reject(err);
      }
    });
  }
}

export interface ProcessTreeStats {
  rss: number;
  cpu_secs: number;
  cpu_pct: number;
}

/**
 * Recursively sum process statistics for a process and all its children.
 * This function aggregates CPU time, memory usage, and CPU percentage
 * for a process tree starting from the given PID.
 */
export function sumChildren(
  procs: Processes,
  children: { [pid: number]: number[] },
  pid: number,
): ProcessTreeStats | null {
  const proc = procs[`${pid}`];
  if (proc == null) {
    return null;
  }

  let rss = proc.stat.mem.rss;
  let cpu_secs = proc.cpu.secs;
  let cpu_pct = proc.cpu.pct;

  for (const ch of children[pid] ?? []) {
    const sc = sumChildren(procs, children, ch);
    if (sc == null) return null;
    rss += sc.rss;
    cpu_secs += sc.cpu_secs;
    cpu_pct += sc.cpu_pct;
  }

  return { rss, cpu_secs, cpu_pct };
}
