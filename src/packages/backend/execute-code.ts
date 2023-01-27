//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################

// Execute code in a subprocess.

import getLogger from "@cocalc/backend/logger";
import * as temp from "temp";
import { series as async_series } from "async";
import * as fs from "fs";
import { spawn } from "child_process";
import shellEscape from "shell-escape";
import { aggregate } from "@cocalc/util/aggregate";
import { to_json, trunc, walltime } from "@cocalc/util/misc";
import { callback_opts } from "@cocalc/util/async-utils";

const log = getLogger("execute-code");

export interface ExecuteCodeOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface ExecuteCodeOptions {
  command: string;
  args?: string[];
  path?: string; // defaults to home directory; where code is executed from
  timeout?: number; // timeout in *seconds*
  ulimit_timeout?: boolean; // If set (the default), use ulimit to ensure a cpu timeout -- don't use when launching a daemon!
  // This has no effect if bash not true.
  err_on_exit?: boolean; // if true (the default), then a nonzero exit code will result in cb(error_message)
  max_output?: number; // bound on size of stdout and stderr; further output ignored
  bash?: boolean; // if true, ignore args and evaluate command as a bash command
  home?: string;
  uid?: number;
  gid?: number;
  env?: object; // if given, added to exec environment
  aggregate?: string | number; // if given, aggregates multiple calls with same sequence number into one -- see @cocalc/util/aggregate; typically make this a timestamp for compiling code (e.g., latex).
  verbose?: boolean; // default true -- impacts amount of logging
}

export interface ExecuteCodeOptionsWithCallback extends ExecuteCodeOptions {
  cb?: (err: undefined | Error, output: ExecuteCodeOutput) => void;
}

type ExecuteCodeFunctionWithCallback = (opts: ExecuteCodeOptions) => void;

// Async/await interface to executing code.
export async function executeCode(
  opts: ExecuteCodeOptions
): Promise<ExecuteCodeOutput> {
  return await callback_opts(execute_code)(opts);
}

// Callback interface to executing code.
// This will get deprecated and is only used by some old coffeescript code.
export const execute_code: ExecuteCodeFunctionWithCallback = aggregate(
  (opts: ExecuteCodeOptionsWithCallback) => {
    if (opts.args == null) opts.args = [];
    if (opts.timeout == null) opts.timeout = 10;
    if (opts.ulimit_timeout == null) opts.ulimit_timeout = true;
    if (opts.err_on_exit == null) opts.err_on_exit = true;
    if (opts.verbose == null) opts.verbose = true;

    const start_time = walltime();
    if (opts.verbose) {
      log.debug(`execute_code: \"${opts.command} ${opts.args?.join(" ")}\"`);
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

    let stdout = "";
    let stderr = "";
    let exit_code: undefined | number = undefined;

    const env = { ...process.env };

    if (opts.env != null) {
      for (let k in opts.env) {
        const v = opts.env[k];
        env[k] = v;
      }
    }

    if (opts.uid != null) {
      env.HOME = opts.home;
    }

    let ran_code = false;
    let info: any = undefined;

    async_series(
      [
        (c) => {
          let cmd;
          if (!opts.bash) {
            c();
            return;
          }
          if (opts.timeout && opts.ulimit_timeout) {
            // This ensures that everything involved with this
            // command really does die no matter what; it's
            // better than killing from outside, since it gets
            // all subprocesses since they inherit the limits.
            cmd = `ulimit -t ${opts.timeout}\n${opts.command}`;
          } else {
            cmd = opts.command;
          }

          if (opts.verbose) {
            log.debug(
              "execute_code: writing temporary file that contains bash program."
            );
          }
          return temp.open("", function (err, _info) {
            if (err) {
              return c(err);
            } else {
              info = _info;
              opts.command = "bash";
              opts.args = [info.path];
              return fs.writeFile(info.fd, cmd, c);
            }
          });
        },
        (c) => {
          if (info != null) {
            return fs.close(info.fd, c);
          } else {
            return c();
          }
        },
        (c) => {
          if (info != null) {
            return fs.chmod(info.path, 0o700, c);
          } else {
            return c();
          }
        },
        (c) => {
          let r, stdout_is_done;
          if (opts.verbose) {
            log.debug(
              `Spawning the command ${opts.command} with given args ${opts.args} and timeout of ${opts.timeout}s...`
            );
          }
          const o: any = { cwd: opts.path };
          if (env != null) {
            o.env = env;
          }
          if (opts.uid) {
            o.uid = opts.uid;
          }
          if (opts.gid) {
            o.gid = opts.gid;
          }

          try {
            r = spawn(opts.command, opts.args, o);
            if (r.stdout == null || r.stderr == null) {
              // The docs/examples at https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
              // suggest that r.stdout and r.stderr are always defined.  However, this is
              // definitely NOT the case in edge cases, as we have observed.
              c("error creating child process -- couldn't spawn child process");
              return;
            }
          } catch (error) {
            // Yes, spawn can cause this error if there is no memory, and there's no event! --  Error: spawn ENOMEM
            const e = error;
            ran_code = false;
            c(`error ${to_json(e)}`);
            return;
          }

          ran_code = true;

          if (opts.verbose) {
            log.debug("Listen for stdout, stderr and exit events.");
          }
          stdout = "";
          r.stdout.on("data", function (data) {
            data = data.toString();
            if (opts.max_output != null) {
              if (stdout.length < opts.max_output) {
                return (stdout += data.slice(
                  0,
                  opts.max_output - stdout.length
                ));
              }
            } else {
              return (stdout += data);
            }
          });

          r.stderr.on("data", function (data) {
            data = data.toString();
            if (opts.max_output != null) {
              if (stderr.length < opts.max_output) {
                return (stderr += data.slice(
                  0,
                  opts.max_output - stderr.length
                ));
              }
            } else {
              return (stderr += data);
            }
          });

          let stderr_is_done = (stdout_is_done = false);

          r.stderr.on("end", function () {
            stderr_is_done = true;
            return finish();
          });

          r.stdout.on("end", function () {
            stdout_is_done = true;
            return finish();
          });

          r.on("exit", function (code) {
            exit_code = code;
            return finish();
          });

          // This can happen, e.g., "Error: spawn ENOMEM" if there is no memory.  Without this handler,
          // an unhandled exception gets raised, which is nasty.
          // From docs: "Note that the exit-event may or may not fire after an error has occurred. "
          r.on("error", function (err) {
            if (exit_code == null) {
              exit_code = 1;
            }
            stderr += to_json(err);
            // a fundamental issue, we were not running some code
            ran_code = false;
            return finish();
          });

          let callback_done = false;
          var finish = function () {
            if (stdout_is_done && stderr_is_done && exit_code != null) {
              if (opts.err_on_exit && exit_code !== 0) {
                if (!callback_done) {
                  callback_done = true;
                  return c(
                    `command '${opts.command}' (args=${opts.args?.join(
                      " "
                    )}) exited with nonzero code ${exit_code} -- stderr='${stderr}'`
                  );
                }
              } else if (!ran_code) {
                // regardless of opts.err_on_exit !
                if (!callback_done) {
                  callback_done = true;
                  return c(
                    `command '${opts.command}' (args=${opts.args?.join(
                      " "
                    )}) was not able to run -- stderr='${stderr}'`
                  );
                }
              } else {
                if (opts.max_output != null) {
                  if (stdout.length >= opts.max_output) {
                    stdout += ` (truncated at ${opts.max_output} characters)`;
                  }
                  if (stderr.length >= opts.max_output) {
                    stderr += ` (truncated at ${opts.max_output} characters)`;
                  }
                }
                if (!callback_done) {
                  callback_done = true;
                  return c();
                }
              }
            }
          };

          if (opts.timeout) {
            const f = function () {
              if (r.exitCode === null) {
                if (opts.verbose) {
                  log.debug(
                    `execute_code: subprocess did not exit after ${opts.timeout} seconds, so killing with SIGKILL`
                  );
                }
                try {
                  r.kill("SIGKILL"); // this does not kill the process group :-(
                } catch (e) {
                  // Exceptions can happen, which left uncaught messes up calling code bigtime.
                  if (opts.verbose) {
                    log.debug("execute_code: r.kill raised an exception.");
                  }
                }
                if (!callback_done) {
                  callback_done = true;
                  return c(
                    `killed command '${opts.command} ${opts.args?.join(" ")}'`
                  );
                }
              }
            };
            return setTimeout(f, opts.timeout * 1000);
          }
        },
        (c) => {
          if (info?.path != null) {
            // Do not litter:
            return fs.unlink(info.path, c);
          } else {
            return c();
          }
        },
      ],
      (err) => {
        if (exit_code == null) {
          exit_code = 1; // don't have one due to SIGKILL
        }

        // This log message is very dangerous, e.g., it could print out a secret_token to a log file.
        // So it commented out.  Only include for low level debugging.
        // log.debug(`(time: ${walltime() - start_time}): Done running '${opts.command} ${opts.args?.join(' ')}'; resulted in stdout='${trunc(stdout,512)}', stderr='${trunc(stderr,512)}', exit_code=${exit_code}, err=${err}`)

        if (opts.verbose) {
          log.debug(
            `finished exec of ${opts.command} (took ${walltime(start_time)}s)`
          );
          log.debug(
            `stdout='${trunc(stdout, 512)}', stderr='${trunc(
              stderr,
              512
            )}', exit_code=${exit_code}`
          );
        }
        if (!opts.err_on_exit && ran_code) {
          // as long as we made it to running some code, we consider this a
          // success (that is what err_on_exit means).
          opts.cb?.(undefined, { stdout, stderr, exit_code });
        } else {
          opts.cb?.(err, { stdout, stderr, exit_code });
        }
      }
    );
  }
);
