export const ASYNC_STATES = ["running", "completed", "error"] as const;

export type AsyncStatus = (typeof ASYNC_STATES)[number];

interface ExecuteCodeBase {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface ExecuteCodeOutputBlocking extends ExecuteCodeBase {
  type: "blocking";
}

export interface ExecuteCodeOutputAsync extends ExecuteCodeBase {
  type: "async";
  start: number;
  job_id: string;
  status: AsyncStatus | "killed"; // killed is only set by the frontend (latex)
  elapsed_s?: number; // how long it took, async execution
  pid?: number; // in case you want to kill it remotely, good to know the PID
  stats?: {
    timestamp: number;
    mem_rss: number;
    cpu_pct: number;
    cpu_secs: number;
  }[];
}

export type ExecuteCodeOutput =
  | ExecuteCodeOutputBlocking
  | ExecuteCodeOutputAsync;

export interface ExecuteCodeOptions {
  command: string;
  args?: string[];
  path?: string; // defaults to home directory; where code is executed from.  absolute path or path relative to home directory.
  cwd?: string; // absolute path where code excuted from (if path not given)
  timeout?: number; // timeout in **seconds**
  ulimit_timeout?: boolean; // If set (the default), use ulimit to ensure a cpu timeout -- don't use when launching a daemon!
  // This has no effect if bash not true.
  err_on_exit?: boolean; // if true (the default), then a nonzero exit code will result in an error; if false, even with a nonzero exit code you just get back the stdout, stderr and the exit code as usual.
  max_output?: number; // bound on size of stdout and stderr; further output ignored
  bash?: boolean; // if true, ignore args and evaluate command as a bash command
  home?: string;
  uid?: number;
  gid?: number;
  env?: object; // if given, added to exec environment
  aggregate?: string | number; // if given, aggregates multiple calls with same sequence number into one -- see @cocalc/util/aggregate; typically make this a timestamp for compiling code (e.g., latex).
  verbose?: boolean; // default true -- impacts amount of logging
  async_call?: boolean; // default false -- if true, return right after the process started (to get the PID) or when it fails.
  // for compute servers:
  compute_server_id?: number;
  // in the filesystem container of a compute server
  filesystem?: boolean;
}

export interface ExecuteCodeOptionsAsyncGet {
  async_get: string; // if set, everything else is ignored and the status/output of the async call is returned
  async_stats?: boolean; // if set, additionally return recorded cpu and memory metrics
  async_await?: boolean; // if set, the call returns when the job finishes (status "complete" or "error")
}

export interface ExecuteCodeOptionsWithCallback extends ExecuteCodeOptions {
  cb?: (err: undefined | Error, output?: ExecuteCodeOutput) => void;
}

export type ExecuteCodeFunctionWithCallback = (
  opts: ExecuteCodeOptionsWithCallback,
) => void;

export function isExecuteCodeOptionsAsyncGet(
  opts: unknown,
): opts is ExecuteCodeOptionsAsyncGet {
  return typeof (opts as any)?.async_get === "string";
}
