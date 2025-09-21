/*
 *  This file is part of CoCalc: Copyright © 2020–2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Execute code in a subprocess.

import { callback, delay } from "awaiting";
import LRU from "lru-cache";
import {
  ChildProcessWithoutNullStreams,
  spawn,
  SpawnOptionsWithoutStdio,
} from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:stream";
import shellEscape from "shell-escape";
import getLogger from "@cocalc/backend/logger";
import { envToInt } from "@cocalc/backend/misc/env-to-number";
import { aggregate } from "@cocalc/util/aggregate";
import { callback_opts } from "@cocalc/util/async-utils";
import { PROJECT_EXEC_DEFAULT_TIMEOUT_S } from "@cocalc/util/consts/project";
import { to_json, trunc, uuid, walltime } from "@cocalc/util/misc";
import {
  ExecuteCodeOutputAsync,
  ExecuteCodeOutputBlocking,
  isExecuteCodeOptionsAsyncGet,
  type ExecuteCodeFunctionWithCallback,
  type ExecuteCodeOptions,
  type ExecuteCodeOptionsAsyncGet,
  type ExecuteCodeOptionsWithCallback,
  type ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";
import { Processes } from "@cocalc/util/types/project-info/types";
import { envForSpawn } from "./misc";
import { ProcessStats } from "./process-stats";

const log = getLogger("execute-code");

const PREFIX = "COCALC_PROJECT_ASYNC_EXEC";
const ASYNC_CACHE_MAX = envToInt(`${PREFIX}_CACHE_MAX`, 100);
const ASYNC_CACHE_TTL_S = envToInt(`${PREFIX}_TTL_S`, 60 * 60);
// for async execution, every that many secs check up on the child-tree
let MONITOR_INTERVAL_S = envToInt(`${PREFIX}_MONITOR_INTERVAL_S`, 60);

export function setMonitorIntervalSeconds(n) {
  MONITOR_INTERVAL_S = n;
}

const MONITOR_STATS_LENGTH_MAX = envToInt(
  `${PREFIX}_MONITOR_STATS_LENGTH_MAX`,
  100,
);

log.debug("configuration:", {
  ASYNC_CACHE_MAX,
  ASYNC_CACHE_TTL_S,
  MONITOR_INTERVAL_S,
  MONITOR_STATS_LENGTH_MAX,
});

type AsyncAwait = "finished";
const updates = new EventEmitter();
const eventKey = (type: AsyncAwait, job_id: string): string =>
  `${type}-${job_id}`;

const asyncCache = new LRU<string, ExecuteCodeOutputAsync>({
  max: ASYNC_CACHE_MAX,
  ttl: 1000 * ASYNC_CACHE_TTL_S,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
});

function truncStats(obj?: ExecuteCodeOutputAsync) {
  if (Array.isArray(obj?.stats)) {
    // truncate to $MONITOR_STATS_LENGTH_MAX, by discarding the inital entries
    obj.stats = obj.stats.slice(obj.stats.length - MONITOR_STATS_LENGTH_MAX);
  }
}

function asyncCacheUpdate(job_id: string, upd): ExecuteCodeOutputAsync {
  const obj = asyncCache.get(job_id);
  if (Array.isArray(obj?.stats) && Array.isArray(upd.stats)) {
    obj.stats.push(...upd.stats);
    truncStats(obj);
  }
  const next: ExecuteCodeOutputAsync = { ...obj, ...upd };
  asyncCache.set(job_id, next);
  if (next.status !== "running") {
    updates.emit(eventKey("finished", next.job_id), next);
  }
  return next;
}

// Async/await interface to executing code.
export async function executeCode(
  opts: ExecuteCodeOptions | ExecuteCodeOptionsAsyncGet,
): Promise<ExecuteCodeOutput> {
  return await callback_opts(execute_code)(opts);
}

// Callback interface to executing code.
// This will get deprecated and is only used by some old coffeescript code.
export const execute_code: ExecuteCodeFunctionWithCallback = aggregate(
  (opts: ExecuteCodeOptionsWithCallback): void => {
    (async () => {
      try {
        let data = await executeCodeNoAggregate(opts);
        if (isExecuteCodeOptionsAsyncGet(opts) && data.type === "async") {
          // stats could contain a lot of data. we only return it if requested.
          if (opts.async_stats !== true) {
            data = { ...data, stats: undefined };
          }
        }
        opts.cb?.(undefined, data);
      } catch (err) {
        opts.cb?.(err);
      }
    })();
  },
);

export async function cleanUpTempDir(tempDir: string | undefined) {
  if (tempDir) {
    try {
      await rm(tempDir, { force: true, recursive: true });
    } catch (err) {
      console.log("WARNING: issue cleaning up tempDir", err);
    }
  }
}

// actual implementation, without the aggregate wrapper
async function executeCodeNoAggregate(
  opts: ExecuteCodeOptions | ExecuteCodeOptionsAsyncGet,
): Promise<ExecuteCodeOutput> {
  if (isExecuteCodeOptionsAsyncGet(opts)) {
    const key = opts.async_get;
    const cached = asyncCache.get(key);
    if (cached != null) {
      const { async_await } = opts;
      if (cached.status === "running" && async_await === true) {
        return new Promise((done) =>
          updates.once(eventKey("finished", key), (data) => done(data)),
        );
      } else {
        return cached;
      }
    } else {
      throw new Error(`Async operation '${key}' does not exist.`);
    }
  }

  opts.args ??= [];
  opts.timeout ??= PROJECT_EXEC_DEFAULT_TIMEOUT_S;
  opts.ulimit_timeout ??= true;
  opts.err_on_exit ??= true;
  opts.verbose ??= false;

  if (opts.verbose) {
    log.debug(`input: ${opts.command} ${opts.args?.join(" ")}`);
  }
  const s = opts.command.split(/\s+/g); // split on whitespace
  if (opts.args?.length === 0 && s.length > 1) {
    opts.bash = true;
  } else if (opts.bash && opts.args?.length > 0) {
    // Selected bash, but still passed in args.
    opts.command = shellEscape([opts.command].concat(opts.args));
    opts.args = [];
  }

  if (opts.home == null) {
    opts.home = process.env.HOME;
  }

  if (opts.path == null) {
    opts.path = opts.home;
  } else if (opts.path[0] !== "/") {
    opts.path = opts.home + "/" + opts.path;
  }
  if (opts.cwd) {
    opts.path = opts.cwd;
  }

  let tempDir: string | undefined = undefined;

  try {
    let origCommand = "";
    if (opts.bash) {
      // using bash, which (for better or worse), we do by writing the command to run
      // under bash to a file, then executing that file.
      let cmd: string;
      if (opts.timeout && opts.ulimit_timeout) {
        // This ensures that everything involved with this
        // command really does die no matter what; it's
        // better than killing from outside, since it gets
        // all subprocesses since they inherit the limits.
        // Leave it to the OS.  Note that the argument to ulimit
        // must be a whole number.
        cmd = `ulimit -t ${Math.ceil(opts.timeout)}\n${opts.command}`;
      } else {
        cmd = opts.command;
      }

      // We write the cmd to a file, and replace the command and args
      // with bash and the filename, then do everything below as we would
      // have done anyways.
      origCommand = opts.command;
      opts.command = "bash";
      tempDir = await mkdtemp(join(tmpdir(), "cocalc-"));
      const tempPath = join(tempDir, "a.sh");
      if (opts.verbose) {
        log.debug("writing temp file that contains bash program", tempPath);
      }
      opts.args = [tempPath];
      await writeFile(tempPath, cmd);
      await chmod(tempPath, 0o700);
    }

    if (opts.async_call) {
      // we return an ID, the caller can then use it to query the status
      opts.max_output ??= 1024 * 1024; // we limit how much we keep in memory, to avoid problems;
      opts.timeout ??= PROJECT_EXEC_DEFAULT_TIMEOUT_S;
      const job_id = uuid();
      const start = Date.now();
      const job_config: ExecuteCodeOutputAsync = {
        type: "async",
        stdout: "",
        stderr: "",
        exit_code: 0,
        start,
        job_id,
        status: "running",
      };
      asyncCache.set(job_id, job_config);

      const child = doSpawn(
        { ...opts, origCommand, job_id, job_config },
        async (err, result) => {
          log.debug("async/doSpawn returned", { err, result });
          try {
            const info: Omit<
              ExecuteCodeOutputAsync,
              "stdout" | "stderr" | "exit_code"
            > = {
              job_id,
              type: "async",
              elapsed_s: (Date.now() - start) / 1000,
              start,
              status: "error",
            };
            if (err) {
              asyncCacheUpdate(job_id, {
                stdout: "",
                stderr: `${err}`,
                exit_code: 1,
                ...info,
              });
            } else if (result != null) {
              asyncCacheUpdate(job_id, {
                ...result,
                ...info,
                ...{ status: "completed" },
              });
            } else {
              asyncCacheUpdate(job_id, {
                stdout: "",
                stderr: `No result`,
                exit_code: 1,
                ...info,
              });
            }
          } finally {
            await cleanUpTempDir(tempDir);
          }
        },
      );
      const pid = child?.pid;

      // pid could be undefined, this means it wasn't possible to spawn a child
      return { ...job_config, pid };
    } else {
      // This is the blocking variant
      return await callback(doSpawn, { ...opts, origCommand });
    }
  } finally {
    // do not delete the tempDir in async mode!
    if (!opts.async_call) {
      await cleanUpTempDir(tempDir);
    }
  }
}

function sumChildren(
  procs: Processes,
  children: { [pid: number]: number[] },
  pid: number,
): { rss: number; pct_cpu: number; cpu_secs: number } | null {
  const proc = procs[`${pid}`];
  if (proc == null) {
    log.debug(`sumChildren: no process ${pid} in proc`);
    return null;
  }
  let rss = proc.stat.mem.rss;
  let pct_cpu = proc.cpu.pct;
  let cpu_secs = proc.cpu.secs;
  for (const ch of children[pid] ?? []) {
    const sc = sumChildren(procs, children, ch);
    if (sc == null) return null;
    rss += sc.rss;
    pct_cpu += sc.pct_cpu;
    cpu_secs += sc.cpu_secs;
  }
  return { rss, pct_cpu, cpu_secs };
}

function doSpawn(
  opts: ExecuteCodeOptions & {
    origCommand: string;
    job_id?: string;
    job_config?: ExecuteCodeOutputAsync;
  },
  cb?: (err: string | undefined, result?: ExecuteCodeOutputBlocking) => void,
) {
  const start_time = walltime();

  if (opts.verbose) {
    log.debug(
      "spawning",
      opts.command,
      "with args",
      opts.args,
      "and timeout",
      opts.timeout,
      "seconds",
    );
  }

  const spawnOptions: SpawnOptionsWithoutStdio = {
    detached: true, // so we can kill the entire process group if it times out
    cwd: opts.path,
    ...(opts.uid ? { uid: opts.uid } : undefined),
    ...(opts.gid ? { uid: opts.gid } : undefined),
    env: {
      ...envForSpawn(),
      ...opts.env,
      ...(opts.uid != null && opts.home ? { HOME: opts.home } : undefined),
    },
  };

  // This is the state, which will be captured in closures
  let child: ChildProcessWithoutNullStreams;
  let ran_code = false;
  let stdout = "";
  let stderr = "";
  let exit_code: undefined | number = undefined;
  let stderr_is_done = false;
  let stdout_is_done = false;
  let killed = false;
  let callback_done = false; // set in "finish", which is also called in a timeout
  let timer: NodeJS.Timeout | undefined = undefined;

  // periodically check up on the child process tree and record stats
  // this also keeps the entry in the cache alive, when the ttl is less than the duration of the execution
  async function startMonitor() {
    const pid = child.pid;
    const { job_id, job_config } = opts;
    if (job_id == null || pid == null || job_config == null) return;
    const monitor = new ProcessStats();
    await monitor.init();
    await delay(1000);
    if (callback_done) return;

    while (true) {
      if (callback_done) return;
      const { procs } = await monitor.processes(Date.now());
      // reconstruct process tree
      const children: { [pid: number]: number[] } = {};
      for (const p of Object.values(procs)) {
        const { pid, ppid } = p;
        children[ppid] ??= [];
        children[ppid].push(pid);
      }
      // we only consider those, which are the pid itself or one of its children
      const sc = sumChildren(procs, children, pid);
      if (sc == null) {
        // If the process by PID is no longer known, either the process was killed or there are too many running.
        // in any case, stop monitoring and do not update any data.
        return;
      }
      const { rss, pct_cpu, cpu_secs } = sc;
      // ?? fallback, in case the cache "forgot" about it
      const obj = asyncCache.get(job_id) ?? job_config;
      obj.pid = pid;
      obj.stats ??= [];
      obj.stats.push({
        timestamp: Date.now(),
        mem_rss: rss,
        cpu_pct: pct_cpu,
        cpu_secs,
      });
      truncStats(obj);
      asyncCache.set(job_id, obj);

      // initially, we record more frequently, but then we space it out up until the interval (probably 1 minute)
      const elapsed_s = (Date.now() - job_config.start) / 1000;
      // i.e. after 6 minutes, we check every minute
      const next_s = Math.max(1, Math.floor(elapsed_s / 6));
      const wait_s = Math.min(next_s, MONITOR_INTERVAL_S);
      await delay(wait_s * 1000);
    }
  }

  try {
    child = spawn(opts.command, opts.args, spawnOptions);
    if (child.stdout == null || child.stderr == null) {
      // The docs/examples at https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
      // suggest that r.stdout and r.stderr are always defined.  However, this is
      // definitely NOT the case in edge cases, as we have observed.
      cb?.("error creating child process -- couldn't spawn child process");
      return;
    }
  } catch (error) {
    // Yes, spawn can cause this error if there is no memory, and there's no
    // event! --  Error: spawn ENOMEM
    ran_code = false;
    cb?.(`error ${error}`);
    return;
  }

  ran_code = true;

  if (opts.verbose) {
    log.debug("listening for stdout, stderr and exit_code...");
  }

  function update_async(
    job_id: string | undefined,
    aspect: "stdout" | "stderr" | "pid",
    data: string | number,
  ): ExecuteCodeOutputAsync | undefined {
    if (!job_id) return;
    // job_config fallback, in case the cache forgot about it
    const obj = asyncCache.get(job_id) ?? opts.job_config;
    if (obj != null) {
      if (aspect === "pid") {
        if (typeof data === "number") {
          obj.pid = data;
        }
      } else if (typeof data === "string") {
        obj[aspect] = data;
      }
      asyncCache.set(job_id, obj);
    }
    return obj;
  }

  child.stdout.on("data", (data) => {
    data = data.toString();
    if (opts.max_output != null) {
      if (stdout.length < opts.max_output) {
        stdout += data.slice(0, opts.max_output - stdout.length);
      }
    } else {
      stdout += data;
    }
    update_async(opts.job_id, "stdout", stdout);
  });

  child.stderr.on("data", (data) => {
    data = data.toString();
    if (opts.max_output != null) {
      if (stderr.length < opts.max_output) {
        stderr += data.slice(0, opts.max_output - stderr.length);
      }
    } else {
      stderr += data;
    }
    update_async(opts.job_id, "stderr", stderr);
  });

  child.stderr.on("end", () => {
    stderr_is_done = true;
    finish();
  });

  child.stdout.on("end", () => {
    stdout_is_done = true;
    finish();
  });

  // Doc: https://nodejs.org/api/child_process.html#event-exit – read it!
  // TODO: This is not 100% correct, because in case the process is killed (signal TERM),
  // the $code is "null" and a second argument gives the signal (as a string). Hence, after a kill,
  // this code below changes the exit code to 0. This could be a special case, though.
  // It cannot be null, though, because the "finish" callback assumes that stdout, err and exit are set.
  // The local $killed var is only true, if the process has been killed by the timeout – not by another kill.
  child.on("exit", (code) => {
    exit_code = code ?? 0;
    finish();
  });

  // This can happen, e.g., "Error: spawn ENOMEM" if there is no memory.  Without this handler,
  // an unhandled exception gets raised, which is nasty.
  // From docs: "Note that the exit-event may or may not fire after an error has occurred. "
  child.on("error", (err) => {
    if (exit_code == null) {
      exit_code = 1;
    }
    stderr += to_json(err);
    // a fundamental issue, we were not running some code
    ran_code = false;
    finish();
  });

  if (opts.job_id && child.pid) {
    // we don't await it, it runs until $callback_done is true
    update_async(opts.job_id, "pid", child.pid);
    startMonitor();
  }

  const finish = (err?) => {
    if (!killed && (!stdout_is_done || !stderr_is_done || exit_code == null)) {
      // it wasn't killed and none of stdout, stderr, and exit_code hasn't been set.
      // so we let the rest of them get set before actually finishing up.
      return;
    }
    if (callback_done) {
      // we already finished up.
      return;
    }
    // finally finish up – this will also terminate the monitor
    callback_done = true;

    if (timer != null) {
      clearTimeout(timer);
      timer = undefined;
    }

    if (opts.verbose && log.isEnabled("debug")) {
      log.debug(
        "exec",
        opts.command,
        "took",
        Math.ceil(1000 * walltime(start_time)),
        "milliseconds",
      );
      log.debug({
        stdout: trunc(stdout, 512),
        stderr: trunc(stderr, 512),
        exit_code,
      });
    }

    if (err) {
      cb?.(err);
    } else if (opts.err_on_exit && exit_code != 0) {
      const x = opts.origCommand
        ? opts.origCommand
        : `'${opts.command}' (args=${opts.args?.join(" ")})`;
      if (opts.job_id) {
        cb?.(stderr);
      } else {
        // sync behavor, like it was before
        cb?.(
          `command '${x}' exited with nonzero code ${exit_code} -- stderr='${trunc(
            stderr,
            1024,
          )}'`,
        );
      }
    } else if (!ran_code) {
      // regardless of opts.err_on_exit !
      const x = opts.origCommand
        ? opts.origCommand
        : `'${opts.command}' (args=${opts.args?.join(" ")})`;
      cb?.(
        `command '${x}' was not able to run -- stderr='${trunc(stderr, 1024)}'`,
      );
    } else {
      if (opts.max_output != null) {
        if (stdout.length >= opts.max_output) {
          stdout += ` (truncated at ${opts.max_output} characters)`;
        }
        if (stderr.length >= opts.max_output) {
          stderr += ` (truncated at ${opts.max_output} characters)`;
        }
      }
      if (exit_code == null) {
        // if exit-code not set, may have been SIGKILL so we set it to 1
        exit_code = 1;
      }
      cb?.(undefined, { type: "blocking", stdout, stderr, exit_code });
    }
  };

  if (opts.timeout) {
    // setup a timer that will kill the command after a certain amount of time.
    const f = () => {
      if (child.exitCode != null) {
        // command already exited.
        return;
      }
      if (opts.verbose) {
        log.debug(
          "subprocess did not exit after",
          opts.timeout,
          "seconds, so killing with SIGKILL",
        );
      }
      try {
        killed = true; // we set the kill flag in any case – i.e. process will no longer exist
        if (child.pid != null) {
          process.kill(-child.pid, "SIGKILL"); // this should kill process group
        }
      } catch (err) {
        // Exceptions can happen, which left uncaught messes up calling code big time.
        if (opts.verbose) {
          log.debug("process.kill raised an exception", err);
        }
      }
      finish(`killed command '${opts.command} ${opts.args?.join(" ")}'`);
    };
    timer = setTimeout(f, opts.timeout * 1000);
  }

  return child;
}
