const { writeFile, readFile } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { spawn } = require("child_process");
// const { replace_all } = require("smc-util/misc");

interface ParserOptions {
  parser: string;
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

export async function python_format(
  input: string,
  options: ParserOptions
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(tmp.file);
  await callback(writeFile, input_path, input);

  // spawn the python formatter
  const util = options.util || "yapf";
  const py_formatter = yapf(input_path);

  // stdout/err capture
  let stdout: string = "";
  let stderr: string = "";
  // read data as it is produced.
  py_formatter.stdout.on("data", data => (stdout += data.toString()));
  py_formatter.stderr.on("data", data => (stderr += data.toString()));
  // wait for subprocess to close.
  let code = await callback(close, py_formatter);
  if (code) {
    throw Error(
      `Python formatter "${util}" exited with code ${code}\nOutput:\n${stdout}\n${stderr}`
    );
  }

  // all fine, we read from the temp file
  let output: string = await callback(readFile, input_path);

  return output;
}
