import { spawn } from "node:child_process";
import { arch } from "node:os";
import { type ExecOutput } from "@cocalc/conat/files/fs";
export { type ExecOutput };

const DEFAULT_TIMEOUT = 3_000;
const DEFAULT_MAX_SIZE = 10_000_000;

export interface Options {
  // the path to the command
  cmd: string;
  // positional arguments; these are not checked in any way, so are given after '--' for safety
  positionalArgs?: string[];
  // whitelisted args flags; these are checked according to the whitelist specified below
  options?: string[];
  // if given, use these options when os.arch()=='darwin' (i.e., macOS)
  darwin?: string[];
  // if given, use these options when os.arch()=='linux'
  linux?: string[];
  // when total size of stdout and stderr hits this amount, command is terminated, and
  // truncated is set.  The total amount of output may thus be slightly larger than maxOutput
  maxSize?: number;
  // command is terminated after this many ms
  timeout?: number;
  // each command line option that is explicitly whitelisted
  // should be a key in the following whitelist map.
  // The value can be either:
  //   - true: in which case the option does not take a argument, or
  //   - a function: in which the option takes exactly one argument; the function should validate that argument
  //     and throw an error if the argument is not allowed.
  whitelist?: { [option: string]: true | ValidateFunction };
  // where to launch command
  cwd?: string;
}

type ValidateFunction = (value: string) => void;

export default async function exec({
  cmd,
  positionalArgs = [],
  options = [],
  linux = [],
  darwin = [],
  maxSize = DEFAULT_MAX_SIZE,
  timeout = DEFAULT_TIMEOUT,
  whitelist = {},
  cwd,
}: Options): Promise<ExecOutput> {
  if (arch() == "darwin") {
    options = options.concat(darwin);
  } else if (arch() == "linux") {
    options = options.concat(linux);
  }
  options = parseAndValidateOptions(options, whitelist);

  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let truncated = false;
    let stdoutSize = 0;
    let stderrSize = 0;

    const args = options.concat(["--"]).concat(positionalArgs);
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {},
      cwd,
    });

    let timeoutHandle: NodeJS.Timeout | null = null;

    if (timeout > 0) {
      timeoutHandle = setTimeout(() => {
        truncated = true;
        child.kill("SIGTERM");
        // Force kill after grace period
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 1000);
      }, timeout);
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize + stderrSize >= maxSize) {
        truncated = true;
        child.kill("SIGTERM");
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrSize += chunk.length;
      if (stdoutSize + stderrSize > maxSize) {
        truncated = true;
        child.kill("SIGTERM");
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (err) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      reject(err);
    });

    child.once("close", (code) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      resolve({
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
        code,
        truncated,
      });
    });
  });
}

function parseAndValidateOptions(options: string[], whitelist): string[] {
  const validatedOptions: string[] = [];
  let i = 0;

  while (i < options.length) {
    const opt = options[i];

    // Check if this is a safe option
    const validate = whitelist[opt];
    if (!validate) {
      throw new Error(`Disallowed option: ${opt}`);
    }
    validatedOptions.push(opt);

    // Handle options that take values
    if (validate !== true) {
      i++;
      if (i >= options.length) {
        throw new Error(`Option ${opt} requires a value`);
      }
      const value = options[i];
      validate(value);
      // didn't throw, so good to go
      validatedOptions.push(value);
    }
    i++;
  }
  return validatedOptions;
}
