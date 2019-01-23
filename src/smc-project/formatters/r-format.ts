const { writeFile, readFile } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { spawn } = require("child_process");
// const { replace_all } = require("smc-util/misc");

interface ParserOptions {
  parser?: string;
  variant?: "styler" | "formatR";
  tabWidth?: number;
  lineWidth?: number;
}

function close(proc, cb): void {
  proc.on("close", code => cb(undefined, code));
}

function formatR(input_path: string, variant) {
  // in-place is fine, according to my tests
  let expr: string | undefined;
  variant = variant ? variant : "styler";
  if (variant == "formatR") {
    expr = `suppressMessages(require(formatR)); tidy_source(source="${input_path}", file="${input_path}", indent=2, width.cutoff=80)`;
  } else if (variant == "styler") {
    expr = `suppressMessages(require(styler)); styler::style_file("${input_path}")`;
  }
  if (expr != null) {
    return spawn("R", ["--quiet", "--vanilla", "--no-save", "-e", expr]);
  } else {
    throw new Error(`formatR: unknown variant :'${variant}'`);
  }
}

export async function r_format(
  input: string,
  options: ParserOptions,
  ext: string,
  logger: any
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(tmp.file, { postfix: `.${ext}` });
  await callback(writeFile, input_path, input);

  // spawn the R formatter
  const r_formatter = formatR(input_path, options.variant);

  // stdout/err capture
  let stdout: string = "";
  let stderr: string = "";
  // read data as it is produced.
  r_formatter.stdout.on("data", data => (stdout += data.toString()));
  r_formatter.stderr.on("data", data => (stderr += data.toString()));
  // wait for subprocess to close.
  let code = await callback(close, r_formatter);
  if (code) {
    const err_msg = `${stderr}`;
    logger.debug(`R_FORMAT ${err_msg}`);
    throw new Error(err_msg);
  }

  // all fine, we read from the temp file
  let output: Buffer = await callback(readFile, input_path);
  let s: string = output.toString("utf-8");

  return s;
}
