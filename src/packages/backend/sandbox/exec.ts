import { execFile, spawn } from "node:child_process";
import { arch } from "node:os";
import { type ExecOutput } from "@cocalc/conat/files/fs";
export { type ExecOutput };
import getLogger from "@cocalc/backend/logger";
import { nsjail as nsjailPath } from "./install";

const logger = getLogger("files:sandbox:exec");

const DEFAULT_TIMEOUT = 3_000;
const DEFAULT_MAX_SIZE = 10_000_000;

export interface Options {
  // the path to the command
  cmd: string;
  // position args *before* any options; these are not sanitized
  prefixArgs?: string[];
  // positional arguments; these are not sanitized, but are given after '--' for safety
  positionalArgs?: string[];
  // whitelisted args flags; these are checked according to the whitelist specified below
  options?: string[];
  // if given, use these options when os.arch()=='darwin' (i.e., macOS); these must match whitelist
  darwin?: string[];
  // if given, use these options when os.arch()=='linux'; these must match whitelist
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

  // options that are always included first for safety and need NOT match whitelist
  safety?: string[];

  // if nodejs is running as root and give this username, then cmd runs as this
  // user instead.
  username?: string;

  // run command under nsjail with these options, which are not sanitized
  // in any way.
  nsjail?: string[];

  // by default the environment is EMPTY, which is usually what we want for fairly
  // locked down execution.  Use this to add something nontrivial to the default empty.
  env?: { [name: string]: string };
}

type ValidateFunction = (value: string) => void;

export default async function exec({
  cmd,
  positionalArgs = [],
  prefixArgs = [],
  options = [],
  linux = [],
  darwin = [],
  safety = [],
  maxSize = DEFAULT_MAX_SIZE,
  timeout = DEFAULT_TIMEOUT,
  whitelist = {},
  cwd,
  username,
  nsjail,
  env = {},
}: Options): Promise<ExecOutput> {
  if (arch() == "darwin") {
    options = options.concat(darwin);
  } else if (arch() == "linux") {
    options = options.concat(linux);
  }
  options = safety.concat(parseAndValidateOptions(options, whitelist));
  const userId = username ? await getUserIds(username) : undefined;

  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let truncated = false;
    let stdoutSize = 0;
    let stderrSize = 0;

    let args = prefixArgs.concat(options);
    if (positionalArgs.length > 0) {
      args.push("--", ...positionalArgs);
    }

    logger.debug({ cmd, args });
    if (nsjail) {
      args = [...nsjail, "--", cmd, ...args];
      cmd = nsjailPath;
    }

    // console.log(`${cmd} ${args.join(" ")}`, { cwd });
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env,
      cwd,
      ...userId,
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

export function parseAndValidateOptions(
  options: string[],
  whitelist,
): string[] {
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
      const value = String(options[i]);
      validate(value);
      // didn't throw, so good to go
      validatedOptions.push(value);
    }
    i++;
  }
  return validatedOptions;
}

export const validate = {
  str: () => {},
  set: (allowed) => {
    allowed = new Set(allowed);
    return (value: string) => {
      if (!allowed.includes(value)) {
        throw Error("invalid value");
      }
    };
  },
  int: (value: string) => {
    const x = parseInt(value);
    if (!isFinite(x)) {
      throw Error("argument must be a number");
    }
  },
  float: (value: string) => {
    const x = parseFloat(value);
    if (!isFinite(x)) {
      throw Error("argument must be a number");
    }
  },
};

async function getUserIds(
  username: string,
): Promise<{ uid: number; gid: number }> {
  return Promise.all([
    new Promise<number>((resolve, reject) => {
      execFile("id", ["-u", username], (err, stdout) => {
        if (err) return reject(err);
        resolve(parseInt(stdout.trim(), 10));
      });
    }),
    new Promise<number>((resolve, reject) => {
      execFile("id", ["-g", username], (err, stdout) => {
        if (err) return reject(err);
        resolve(parseInt(stdout.trim(), 10));
      });
    }),
  ]).then(([uid, gid]) => ({ uid, gid }));
}

// take the output of exec and convert stdout, stderr to strings.  If code is nonzero,
// instead throw an error with message stderr.
export function parseOutput({ stdout, stderr, code, truncated }: ExecOutput) {
  if (code) {
    throw new Error(Buffer.from(stderr).toString());
  }
  return {
    stdout: Buffer.from(stdout).toString(),
    stderr: Buffer.from(stderr).toString(),
    truncated,
  };
}
