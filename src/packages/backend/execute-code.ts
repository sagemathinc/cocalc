//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
import { aggregate } from "@cocalc/util/aggregate";
import { callback_opts } from "@cocalc/util/async-utils";
import { to_json, trunc, uuid, walltime } from "@cocalc/util/misc";
import { envForSpawn } from "./misc";

import {
  isExecuteCodeOptionsAsyncGet,
  type ExecuteCodeFunctionWithCallback,
  type ExecuteCodeOptions,
  type ExecuteCodeOptionsAsyncGet,
  type ExecuteCodeOptionsWithCallback,
  type ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";

const log = getLogger("execute-code");

const asyncCache = new LRU<string, ExecuteCodeOutput>({
  max: 100,
  ttl: 1000 * 60 * 60,
  ttlAutopurge: true,
  allowStale: true,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
});

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

// actual implementation, without the aggregate wrapper
async function executeCodeNoAggregate(
  opts: ExecuteCodeOptions | ExecuteCodeOptionsAsyncGet,
): Promise<ExecuteCodeOutput> {
  if (isExecuteCodeOptionsAsyncGet(opts)) {
    const cached = asyncCache.get(opts.async_get);
    if (cached != null) {
      return cached;
    } else {
      throw new Error(`Async operation '${opts.async_get}' not found.`);
    }
  }

  if (opts.args == null) opts.args = [];
  if (opts.timeout == null) opts.timeout = 10;
  if (opts.ulimit_timeout == null) opts.ulimit_timeout = true;
  if (opts.err_on_exit == null) opts.err_on_exit = true;
  if (opts.verbose == null) opts.verbose = true;

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

    if (opts.async_mode) {
      // we return an ID, the caller can then use it to query the status
      opts.max_output ??= 1024 * 1024; // we limit how much we keep in memory, to avoid problems;
      opts.timeout ??= 10 * 60;
      const id = uuid();
      const start = new Date();
      const started: ExecuteCodeOutput = {
        stdout: `Process started running at ${start.toISOString()}`,
        stderr: "",
        exit_code: 0,
        async_start: start.getTime(),
        async_id: id,
        async_status: "running",
      };
      asyncCache.set(id, started);

      doSpawn({ ...opts, origCommand, async_id: id }, (err, result) => {
        const started = asyncCache.get(id)?.async_start ?? 0;
        const info: Partial<ExecuteCodeOutput> = {
          elapsed_s: (Date.now() - started) / 1000,
          async_start: start.getTime(),
          async_status: "error",
        };
        if (err) {
          asyncCache.set(id, {
            stdout: "",
            stderr: `${err}`,
            exit_code: 1,
            ...info,
          });
        } else if (result != null) {
          asyncCache.set(id, {
            ...result,
            ...info,
            ...{ async_status: "completed" },
          });
        } else {
          asyncCache.set(id, {
            stdout: "",
            stderr: `No result`,
            exit_code: 1,
            ...info,
          });
        }
      });

      return started;
    } else {
      // This is the blocking variant
      return await callback(doSpawn, { ...opts, origCommand });
    }
  } finally {
    // clean up
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
    }
  }
}

function update_async(
  async_id: string | undefined,
  stream: "stdout" | "stderr",
  data: string,
) {
  if (!async_id) return;
  const obj = asyncCache.get(async_id);
  if (obj != null) {
    obj[stream] = data;
  }
}

function doSpawn(
  opts,
  cb: (err: string | undefined, result?: ExecuteCodeOutput) => void,
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

  let r: ChildProcessWithoutNullStreams;
  let ran_code = false;
  try {
    r = spawn(opts.command, opts.args, spawnOptions);
    if (r.stdout == null || r.stderr == null) {
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
  let stdout = "";
  let stderr = "";
  let exit_code: undefined | number = undefined;

  r.stdout.on("data", (data) => {
    data = data.toString();
    if (opts.max_output != null) {
      if (stdout.length < opts.max_output) {
        stdout += data.slice(0, opts.max_output - stdout.length);
      }
    } else {
      stdout += data;
    }
    update_async(opts.async_id, "stdout", stdout);
  });

  r.stderr.on("data", (data) => {
    data = data.toString();
    if (opts.max_output != null) {
      if (stderr.length < opts.max_output) {
        stderr += data.slice(0, opts.max_output - stderr.length);
      }
    } else {
      stderr += data;
    }
    update_async(opts.async_id, "stderr", stderr);
  });

  let stderr_is_done = false;
  let stdout_is_done = false;
  let killed = false;

  r.stderr.on("end", () => {
    stderr_is_done = true;
    finish();
  });

  r.stdout.on("end", () => {
    stdout_is_done = true;
    finish();
  });

  r.on("exit", (code) => {
    exit_code = code != null ? code : undefined;
    finish();
  });

  // This can happen, e.g., "Error: spawn ENOMEM" if there is no memory.  Without this handler,
  // an unhandled exception gets raised, which is nasty.
  // From docs: "Note that the exit-event may or may not fire after an error has occurred. "
  r.on("error", (err) => {
    if (exit_code == null) {
      exit_code = 1;
    }
    stderr += to_json(err);
    // a fundamental issue, we were not running some code
    ran_code = false;
    finish();
  });

  let callback_done = false;
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
      cb(
        `command '${x}' exited with nonzero code ${exit_code} -- stderr='${trunc(
          stderr,
          1024,
        )}'`,
      );
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
      cb(undefined, { stdout, stderr, exit_code });
    }
  };

  let timer: any = undefined;
  if (opts.timeout) {
    // setup a timer that will kill the command after a certain amount of time.
    const f = () => {
      if (r.exitCode != null) {
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
        if (r.pid != null) {
          process.kill(-r.pid, "SIGKILL"); // this should kill process group
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
