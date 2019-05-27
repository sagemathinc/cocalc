const { writeFile, readFile, unlink } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { spawn } = require("child_process");
// const { replace_all } = require("smc-util/misc");

interface ParserOptions {
  parser?: string;
  tabWidth?: number;
  useTabs?: boolean;
  util?: string;
}

function close(proc, cb): void {
  proc.on("close", code => cb(undefined, code));
}

// TODO: diversify this via options to support autopep8, black (requires python 3.6), and others...

function yapf(input_path) {
  return spawn("yapf", ["-i", input_path]);
}

// from a full stacktrace, only show user the last line (encodes some reason and line number) ... everything else does not help.
function last_line(str?: string): string {
  if (str == null) {
    return "Problem running formatter.";
  } else {
    return (
      str
        .trim()
        .split(/\r?\n/)
        .slice(-1)
        .pop() || ""
    );
  }
}

export async function python_format(
  input: string,
  options: ParserOptions,
  logger: any
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(tmp.file);
  try {
    await callback(writeFile, input_path, input);

    // spawn the python formatter
    const util = options.util || "yapf";

    if (util !== "yapf") {
      throw new Error(
        "This project only supports 'yapf' for formatting Python"
      );
    }

    const py_formatter = yapf(input_path);

    py_formatter.on("error", err => {
      // ATTN do not throw an error here, because this is triggered by the subprocess!
      logger.debug(
        `Formatting utility exited with error no ${(err as any).errno}`
      );
    });

    // stdout/err capture
    let stdout: string = "";
    let stderr: string = "";
    // read data as it is produced.
    py_formatter.stdout.on("data", data => (stdout += data.toString()));
    py_formatter.stderr.on("data", data => (stderr += data.toString()));
    // wait for subprocess to close.
    let code = await callback(close, py_formatter);
    // only last line
    // stdout = last_line(stdout);
    if (code) {
      if (code === -2) {
        // ENOENT
        throw new Error(`Formatting utility "${util}" is not installed`);
      }
      stderr = last_line(stderr);
      const err_msg = `Python formatter "${util}" exited with code ${code}:\n${stdout}\n${stderr}`;
      logger.debug(`format python error: ${err_msg}`);
      throw new Error(err_msg);
    }

    // all fine, we read from the temp file
    let output: Buffer = await callback(readFile, input_path);
    let s: string = output.toString("utf-8");
    return s;
  } finally {
    unlink(input_path, () => {});
  }
}
