/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * Backend exec-stream functionality for streaming code execution.
 * Uses the `updates` EventEmitter as a single streaming source,
 * so ALL callers (first and late joiners) get live streaming uniformly.
 */

import {
  ExecuteCodeOutput,
  ExecuteCodeOutputAsync,
} from "@cocalc/util/types/execute-code";
import { asyncCache, eventKey, executeCode, updates } from "./execute-code";
import getLogger from "./logger";
import { abspath } from "./misc_node";

export type StreamEvent = {
  type?: "job" | "stdout" | "stderr" | "stats" | "done" | "error";
  data?: any;
  error?: string;
};

const logger = getLogger("backend:exec-stream");

export interface ExecuteStreamOptions {
  command?: string;
  args?: string[];
  path?: string;
  compute_server_id?: number;
  bash?: boolean;
  env?: { [key: string]: string };
  timeout?: number;
  max_output?: number;
  err_on_exit?: boolean;
  verbose?: boolean;
  project_id?: string;
  debug?: string;
  stream: (event: StreamEvent | null) => void;
}

export async function executeStream(
  options: ExecuteStreamOptions,
): Promise<ExecuteCodeOutput | undefined> {
  const { stream, debug, project_id, ...opts } = options;

  if (debug) {
    logger.debug(`executeStream: ${debug}`);
  }

  try {
    let done = false;

    // Start async execution WITHOUT streamCB — we use updates EventEmitter instead.
    // This ensures ALL callers (first and late joiners) get live streaming uniformly
    // via the same event source, eliminating duplicate event problems.
    const job = await executeCode({
      command: opts.command || "",
      path: !!opts.compute_server_id ? opts.path : abspath(opts.path ?? ""),
      ...opts,
      async_call: true,
    });

    if (job?.type !== "async") {
      stream({ error: "Failed to create async job for streaming" });
      stream(null);
      return undefined;
    }

    const jobId = job.job_id;

    // Subscribe to live streaming events BEFORE sending initial job info
    // (to avoid missing chunks between job info send and listener registration)
    const handleStdout = (data: string) => {
      if (!done) stream({ type: "stdout", data });
    };
    const handleStderr = (data: string) => {
      if (!done) stream({ type: "stderr", data });
    };
    const handleStats = (data: any) => {
      if (!done) stream({ type: "stats", data });
    };
    const cleanup = () => {
      updates.off(eventKey("stdout", jobId), handleStdout);
      updates.off(eventKey("stderr", jobId), handleStderr);
      updates.off(eventKey("stats", jobId), handleStats);
      updates.off(eventKey("finished", jobId), handleFinished);
    };
    const handleFinished = (result: ExecuteCodeOutputAsync) => {
      cleanup();
      if (done) return;
      stream({ type: "done", data: result });
      done = true;
      stream(null);
    };

    updates.on(eventKey("stdout", jobId), handleStdout);
    updates.on(eventKey("stderr", jobId), handleStderr);
    updates.on(eventKey("stats", jobId), handleStats);
    updates.once(eventKey("finished", jobId), handleFinished);

    // Send initial job info (includes accumulated stdout/stderr from asyncCache).
    // Note: up to 100ms of buffered output may not yet be in asyncCache (batch
    // timer hasn't flushed). This data will arrive via the updates listeners
    // registered above, so it's not lost — just slightly delayed in the initial
    // snapshot.  A future optimization could expose a per-job flush mechanism.
    const currentJob = asyncCache.get(job.job_id);
    const initialJobInfo: ExecuteCodeOutputAsync = {
      type: "async",
      job_id: job.job_id,
      pid: job.pid,
      status: currentJob?.status ?? job.status,
      start: job.start,
      stdout: currentJob?.stdout ?? "",
      stderr: currentJob?.stderr ?? "",
      exit_code: currentJob?.exit_code ?? 0,
      stats: currentJob?.stats ?? [],
    };

    stream({ type: "job", data: initialJobInfo });

    // If job already completed, send done event immediately
    if (!done && currentJob && currentJob.status !== "running") {
      cleanup();
      stream({ type: "done", data: currentJob });
      done = true;
      stream(null);
      return currentJob;
    }

    return job;
  } catch (err) {
    stream({ error: `${err}` });
    stream(null);
    return undefined;
  }
}
