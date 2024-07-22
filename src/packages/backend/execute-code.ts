//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: MS-RSL – see LICENSE.md for details
//########################################################################

// Execute code in a subprocess.

import { callback } from "awaiting";
import LRU from "lru-cache";
import {
  ChildProcessWithoutNullStreams,
  spawn,
  SpawnOptionsWithoutStdio,
} from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import shellEscape from "shell-escape";

import getLogger from "@cocalc/backend/logger";
import { envToInt } from "@cocalc/backend/misc/env-to-number";
import { aggregate } from "@cocalc/util/aggregate";
import { callback_opts } from "@cocalc/util/async-utils";
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

const ASYNC_CACHE_MAX = envToInt("COCALC_PROJECT_ASYNC_EXEC_CACHE_MAX", 100);
const ASYNC_CACHE_TTL_S = envToInt("COCALC_PROJECT_ASYNC_EXEC_TTL_S", 60 * 60);
// for async execution, every that many secs check up on the child-tree
const MONITOR_INTERVAL_S = envToInt("COCALC_PROJECT_MONITOR_INTERVAL_S", 60);

const asyncCache = new LRU<string, ExecuteCodeOutputAsync>({
  max: ASYNC_CACHE_MAX,
  ttl: 1000 * ASYNC_CACHE_TTL_S,
  ttlAutopurge: true,
  allowStale: true,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
});

function asyncCacheUpdate(job_id: string, upd) {
  const obj = asyncCache.get(job_id);
  if (Array.isArray(obj?.stats) && Array.isArray(upd.stats)) {
    obj.stats.push(...upd.stats);
  }
  asyncCache.set(job_id, { ...obj, ...upd });
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
        opts.cb?.(undefined, await executeCodeNoAggregate(opts));
      } catch (err) {
        opts.cb?.(err);
      }
    })();
  },
);

async function clean_up_tmp(tempDir: string | undefined) {
  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true });
  }
}

// actual implementation, without the aggregate wrapper
async function executeCodeNoAggregate(
  opts: ExecuteCodeOptions | ExecuteCodeOptionsAsyncGet,
): Promise<ExecuteCodeOutput> {
  if (isExecuteCodeOptionsAsyncGet(opts)) {
    const cached = asyncCache.get(opts.async_get);
    if (cached != null) {
      return cached;
    } else {
      throw new Error(`Async operation '${opts.async_get}' does not exist.`);
    }
  }

  opts.args ??= [];
  opts.timeout ??= 10;
  opts.ulimit_timeout ??= true;
  opts.err_on_exit ??= true;
  opts.verbose ??= true;

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
      opts.timeout ??= 10 * 60;
      const job_id = uuid();
      const start = new Date();
      const job_config: ExecuteCodeOutputAsync = {
        type: "async",
        stdout: `Process started running at ${start.toISOString()}`,
        stderr: "",
        exit_code: 0,
        start: start.getTime(),
        job_id,
        status: "running",
      };
      asyncCache.set(job_id, job_config);

      doSpawn(
        { ...opts, origCommand, job_id, job_config },
        async (err, result) => {
          try {
            const started = asyncCache.get(job_id)?.start ?? 0;
            const info: Omit<
              ExecuteCodeOutputAsync,
              "stdout" | "stderr" | "exit_code"
            > = {
              job_id,
              type: "async",
              elapsed_s: (Date.now() - started) / 1000,
              start: start.getTime(),
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
            await clean_up_tmp(tempDir);
          }
        },
      );

      return job_config;
    } else {
      // This is the blocking variant
      return await callback(doSpawn, { ...opts, origCommand });
    }
  } finally {
    // do not delete the tempDir in async mode!
    if (!opts.async_call) await clean_up_tmp(tempDir);
  }
}

function update_async(
  job_id: string | undefined,
  aspect: "stdout" | "stderr",
  data: string,
) {
  if (!job_id) return;
  const obj = asyncCache.get(job_id);
  if (obj != null) {
    obj[aspect] = data;
  }
}

function sumChildren(
  procs: Processes,
  children: { [pid: number]: number[] },
  pid: number,
): { rss: number; pct_cpu: number; cpu_secs: number } {
  const proc = procs[`${pid}`];
  if (proc == null) {
    log.debug(`sumChildren: no process ${pid} in proc`);
    return { rss: 0, pct_cpu: 0, cpu_secs: 0 };
  }
  let rss = proc.stat.mem.rss;
  let pct_cpu = proc.cpu.pct;
  let cpu_secs = proc.cpu.secs;
  for (const ch of children[pid] ?? []) {
    const sc = sumChildren(procs, children, ch);
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
  cb: (err: string | undefined, result?: ExecuteCodeOutputBlocking) => void,
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
  let callback_done = false;
  let monitorRef: NodeJS.Timer | null = null;
  let timer: NodeJS.Timeout | undefined = undefined;

  // periodically check up on the child process tree and record stats
  // this also keeps the entry in the cache alive, when the ttl is less than the duration of the execution
  async function setupMonitor() {
    const pid = child.pid;
    const job_id = opts.job_id;
    if (job_id == null || pid == null) return;
    const monitor = new ProcessStats();
    await monitor.init();
    await new Promise((done) => setTimeout(done, 1000));
    if (callback_done) return;

    monitorRef = setInterval(async () => {
      const { procs } = await monitor.processes(Date.now());
      // reconstruct process tree
      const children: { [pid: number]: number[] } = {};
      for (const p of Object.values(procs)) {
        const { pid, ppid } = p;
        children[ppid] ??= [];
        children[ppid].push(pid);
      }
      // we only consider those, which are the pid itself or one of its children
      const { rss, pct_cpu, cpu_secs } = sumChildren(procs, children, pid);

      let obj = asyncCache.get(job_id);
      obj ??= opts.job_config; // in case the cache "forgot" about it
      if (obj != null) {
        obj.pid = pid;
        obj.stats ??= [];
        obj.stats.push({
          timestamp: Date.now(),
          mem_rss: rss,
          cpu_pct: pct_cpu,
          cpu_secs,
        });
        asyncCache.set(job_id, obj);
      }
    }, 1000 * MONITOR_INTERVAL_S);
  }

  function clearMonitor() {
    if (monitorRef != null) {
      clearInterval(monitorRef);
      monitorRef = null;
    }
  }

  try {
    child = spawn(opts.command, opts.args, spawnOptions);
    if (child.stdout == null || child.stderr == null) {
      // The docs/examples at https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
      // suggest that r.stdout and r.stderr are always defined.  However, this is
      // definitely NOT the case in edge cases, as we have observed.
      cb("error creating child process -- couldn't spawn child process");
      return;
    }
  } catch (error) {
    // Yes, spawn can cause this error if there is no memory, and there's no
    // event! --  Error: spawn ENOMEM
    ran_code = false;
    cb(`error ${error}`);
    return;
  }

  ran_code = true;

  if (opts.verbose) {
    log.debug("listening for stdout, stderr and exit_code...");
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

  child.on("exit", (code) => {
    exit_code = code != null ? code : undefined;
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
    setupMonitor();
  }

  const finish = (err?) => {
    if (!killed && (!stdout_is_done || !stderr_is_done || exit_code == null)) {
      // it wasn't killed and one of stdout, stderr, and exit_code hasn't been
      // set, so we let the rest of them get set before actually finishing up.
      return;
    }
    if (callback_done) {
      // we already finished up.
      return;
    }
    // finally finish up.
    callback_done = true;
    clearMonitor();

    if (timer != null) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (opts.verbose && log.isEnabled("debug")) {
      log.debug(
        "finished exec of",
        opts.command,
        "took",
        walltime(start_time),
        "seconds",
      );
      log.debug({
        stdout: trunc(stdout, 512),
        stderr: trunc(stderr, 512),
        exit_code,
      });
    }
    if (err) {
      cb(err);
    } else if (opts.err_on_exit && exit_code != 0) {
      const x = opts.origCommand
        ? opts.origCommand
        : `'${opts.command}' (args=${opts.args?.join(" ")})`;
      if (opts.job_id) {
        cb(stderr);
      } else {
        // sync behavor, like it was before
        cb(
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
      cb(
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
      cb(undefined, { type: "blocking", stdout, stderr, exit_code });
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
          log.debug("r.kill raised an exception", err);
        }
      }
      finish(`killed command '${opts.command} ${opts.args?.join(" ")}'`);
    };
    timer = setTimeout(f, opts.timeout * 1000);
  }
}
