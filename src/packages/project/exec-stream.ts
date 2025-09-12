/*
Project-side exec-stream service that handles streaming execution requests.
Similar to how the project API service works, but specifically for streaming exec.
*/

import { delay } from "awaiting";

import { executeCode } from "@cocalc/backend/execute-code";
import { abspath } from "@cocalc/backend/misc_node";
import { ProcessStats, sumChildren } from "@cocalc/backend/process-stats";
import { projectSubject } from "@cocalc/conat/names";
import { connectToConat } from "@cocalc/project/conat/connection";
import { project_id } from "@cocalc/project/data";
import { getLogger } from "@cocalc/project/logger";
import {
  ExecuteCodeOutputAsync,
  ExecuteCodeStats,
} from "@cocalc/util/types/execute-code";

const logger = getLogger("project:exec-stream");

const MONITOR_INTERVAL_S = 60; // Check every minute by default
const MONITOR_STATS_LENGTH_MAX = 100; // Max stats entries

function truncStats(stats: ExecuteCodeStats): ExecuteCodeStats {
  return stats.slice(stats.length - MONITOR_STATS_LENGTH_MAX);
}

export function init() {
  serve();
}

let terminate = false;
async function serve() {
  logger.debug("serve: create project exec-stream service");
  const cn = connectToConat();
  const subject = projectSubject({
    project_id,
    compute_server_id: 0, // This is the project service, always 0
    service: "exec-stream",
  });

  logger.debug(`serve: creating exec-stream service for project ${project_id}`);
  const api = await cn.subscribe(subject, { queue: "q" });
  logger.debug(`serve: subscribed to subject='${subject}'`);
  await listen(api, subject);
}

async function listen(api, _subject) {
  for await (const mesg of api) {
    if (terminate) {
      return;
    }
    (async () => {
      try {
        await handleMessage(mesg);
      } catch (err) {
        logger.debug(`WARNING: issue handling exec-stream message -- ${err}`);
      }
    })();
  }
}

async function handleMessage(mesg) {
  const options = mesg.data;

  let seq = 0;
  const respond = ({
    type,
    data,
    error,
  }: {
    type?: string;
    data?: any;
    error?: string;
  }) => {
    mesg.respondSync({ type, data, error, seq });
    seq += 1;
  };

  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    // end response stream with null payload.
    mesg.respondSync(null);
  };

  const stream = (event?) => {
    if (done) return;
    if (event != null) {
      respond(event);
    } else {
      end();
    }
  };

  try {
    // SECURITY: verify that the project_id claimed in options matches
    // with our actual project_id
    if (options.project_id != project_id) {
      throw Error("project_id is invalid");
    }

    await executeStream({ ...options, stream });
  } catch (err) {
    if (!done) {
      respond({ error: `${err}` });
      end();
    }
  }
}

async function executeStream(options) {
  const { stream, debug, ...opts } = options;

  // Log debug message for debugging purposes
  if (debug) {
    logger.debug(`executeStream: ${debug}`);
  }

  try {
    // Start an async execution job
    const job = await executeCode({
      path: !!opts.compute_server_id ? opts.path : abspath(opts.path ?? ""),
      ...opts,
      async_call: true, // Force async mode for streaming
    });

    if (job?.type !== "async") {
      stream({ error: "Failed to create async job for streaming" });
      return;
    }

    // Send initial job info with full async structure
    const initialJobInfo: ExecuteCodeOutputAsync = {
      type: "async",
      job_id: job.job_id,
      pid: job.pid,
      status: job.status,
      start: job.start,
      stdout: "",
      stderr: "",
      exit_code: 0, // Default to 0, will be updated when job completes
      stats: [],
    };

    stream({
      type: "job",
      data: initialJobInfo,
    });

    let lastStdout = "";
    let lastStderr = "";
    let done = false;
    let stats: ExecuteCodeStats = [];

    // Start process stats monitoring if we have a PID
    let statsMonitor: ProcessStats | undefined;
    if (job.pid != null) {
      logger.debug(
        `executeStream: starting stats monitoring for PID ${job.pid}`,
      );
      statsMonitor = new ProcessStats();
      await statsMonitor.init();
      startStatsMonitoring(job.pid, job.start, stats, stream, () => done);
    } else {
      logger.debug(`executeStream: no PID available for stats monitoring`);
    }

    // Function to check job status and stream updates
    const checkStatus = async () => {
      if (done) return;

      try {
        const status = await executeCode({
          async_get: job.job_id,
          async_stats: true, // Get stats from backend too
        });

        logger.debug(
          `executeStream: poll type=${status?.type}, stdout_len=${status?.stdout?.length ?? 0}, stderr_len=${status?.stderr?.length ?? 0}`,
        );

        if (status?.type !== "async") {
          stream({ error: "Job not found or invalid" });
          done = true;
          return;
        }

        // Stream new stdout content
        if (status.stdout && status.stdout.length > lastStdout.length) {
          const newStdout = status.stdout.slice(lastStdout.length);
          logger.debug(
            `executeStream: streaming stdout chunk: ${newStdout.length} chars (total: ${status.stdout.length}, last: ${lastStdout.length})`,
          );
          stream({
            type: "stdout",
            data: newStdout,
          });
          lastStdout = status.stdout;
        }

        // Stream new stderr content
        if (status.stderr && status.stderr.length > lastStderr.length) {
          const newStderr = status.stderr.slice(lastStderr.length);
          logger.debug(
            `executeStream: streaming stderr chunk: ${newStderr.length} chars (total: ${status.stderr.length}, last: ${lastStderr.length})`,
          );
          stream({
            type: "stderr",
            data: newStderr,
          });
          lastStderr = status.stderr;
        }

        // Check if job is complete
        if (status.status !== "running") {
          // Send the complete async result as expected by frontend
          const finalResult: ExecuteCodeOutputAsync = {
            type: "async",
            job_id: job.job_id,
            stdout: status.stdout ?? "",
            stderr: status.stderr ?? "",
            exit_code: status.exit_code,
            status: status.status,
            elapsed_s: status.elapsed_s,
            start: job.start,
            pid: job.pid,
            stats: truncStats(stats), // Include final stats
          };

          stream({
            type: "done",
            data: finalResult,
          });
          done = true;
          stream(null); // End the stream
          return;
        }

        // Continue polling if still running
        if (!done) {
          setTimeout(checkStatus, 200); // Poll every 200ms
        }
      } catch (err) {
        if (!done) {
          stream({ error: `${err}` });
          done = true;
        }
      }
    };

    // Start monitoring
    checkStatus();
  } catch (err) {
    stream({ error: `${err}` });
  }
}

async function startStatsMonitoring(
  pid: number,
  startTime: number,
  stats: ExecuteCodeStats,
  stream: Function,
  isDone: () => boolean,
) {
  logger.debug(
    `startStatsMonitoring: beginning stats monitoring for PID ${pid}`,
  );
  const monitor = new ProcessStats();
  await monitor.init();
  await delay(1000); // Initial delay
  if (isDone()) {
    logger.debug(`startStatsMonitoring: job already done, stopping`);
    return;
  }

  // Track previous CPU time for percentage calculation
  let prevTotalCpu = 0;
  let prevTimestamp = Date.now();

  while (!isDone()) {
    try {
      const currentTimestamp = Date.now();
      const { procs } = await monitor.processes(currentTimestamp);

      // Reconstruct process tree
      const children: { [pid: number]: number[] } = {};
      for (const p of Object.values(procs)) {
        const { pid: childPid, ppid } = p;
        children[ppid] ??= [];
        children[ppid].push(childPid);
      }

      // Sum stats for this process and its children
      const sc = sumChildren(procs, children, pid);
      if (sc == null) {
        // Process no longer exists, stop monitoring
        return;
      }

      const { rss, cpu_secs } = sc; // cpu_pct available but not used here

      // Calculate CPU percentage based on time elapsed and CPU time used
      const dt = (currentTimestamp - prevTimestamp) / 1000; // Convert to seconds
      const cpu_pct =
        dt > 0 ? Math.min(100, 100 * ((cpu_secs - prevTotalCpu) / dt)) : 0;

      // Update previous values for next calculation
      prevTotalCpu = cpu_secs;
      prevTimestamp = currentTimestamp;

      const statEntry = {
        timestamp: currentTimestamp,
        mem_rss: rss,
        cpu_pct,
        cpu_secs,
      };

      stats.push(statEntry);
      // Keep stats array bounded by truncating in place
      if (stats.length > MONITOR_STATS_LENGTH_MAX) {
        stats.splice(0, stats.length - MONITOR_STATS_LENGTH_MAX);
      }

      // Stream the stats update
      stream({
        type: "stats",
        data: statEntry,
      });

      // Calculate dynamic wait time (more frequent initially, then space out)
      const elapsed_s = (Date.now() - startTime) / 1000;
      const next_s = Math.max(1, Math.floor(elapsed_s / 6));
      const wait_s = Math.min(next_s, MONITOR_INTERVAL_S);

      await delay(wait_s * 1000);
    } catch (err) {
      logger.debug("Error in stats monitoring:", err);
      await delay(5000); // Wait before retrying
    }
  }
}

export function close() {
  terminate = true;
}
