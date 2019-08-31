const { writeFile, readFile, unlink } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { spawn } = require("child_process");
// const { replace_all } = require("smc-util/misc");

interface ParserOptions {
  parser?: string;
  tabWidth?: number;
  lineWidth?: number;
}

function close(proc, cb): void {
  proc.on("close", code => cb(undefined, code));
}

function formatR(input_path: string) {
  // in-place is fine, according to my tests
  const expr = `suppressMessages(require(formatR)); tidy_source(source="${input_path}", file="${input_path}", indent=2, width.cutoff=80)`;
  return spawn("R", ["--quiet", "--vanilla", "--no-save", "-e", expr]);
}

export async function r_format(
  input: string,
  _: ParserOptions,
  logger: any
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(tmp.file);
  try {
    await callback(writeFile, input_path, input);

    // spawn the R formatter
    const r_formatter = formatR(input_path);

    // stdout/err capture
    let stdout: string = "";
    let stderr: string = "";
    // read data as it is produced.
    r_formatter.stdout.on("data", data => (stdout += data.toString()));
    r_formatter.stderr.on("data", data => (stderr += data.toString()));
    // wait for subprocess to close.
    const code = await callback(close, r_formatter);
    if (code) {
      const err_msg = `${stderr}`;
      logger.debug(`R_FORMAT ${err_msg}`);
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
