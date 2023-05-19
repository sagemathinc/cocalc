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
  err_on_exit?: boolean; // if true (the default), then a nonzero exit code will result in an error; if false, even with a nonzero exit code you just get back the stdout, stderr and the exit code as usual.
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
  cb?: (err: undefined | Error, output?: ExecuteCodeOutput) => void;
}

export type ExecuteCodeFunctionWithCallback = (
  opts: ExecuteCodeOptionsWithCallback
) => void;
