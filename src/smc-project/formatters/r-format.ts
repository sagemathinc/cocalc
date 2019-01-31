const { writeFile, readFile, unlink } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { spawn } = require("child_process");
// const { replace_all } = require("smc-util/misc");

type Variant = "styler" | "formatR";

interface ParserOptions {
  parser?: string;
  variant?: Variant;
  tabWidth?: number;
  lineWidth?: number;
}

function close(proc, cb): void {
  proc.on("close", code => cb(undefined, code));
}

function formatR(input_path: string, variant: Variant) {
  // in-place is fine, according to my tests
  let expr: string | undefined;
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

/** styler error example
 *
 * > styler::style_file("some-code.r")
 * Styling  1  files:
 *  some-code.r ⚠
 * ────────────────────────────────────────
 * Status  Count   Legend
 * ✔       0       File unchanged.
 * ℹ       0       File changed.
 * ✖       1       Styling threw an error.
 * ────────────────────────────────────────
 * Warning message:
 * When processing some-code.r: <text>:7:17: unexpected '=='<strong></strong>p
 * 6:   for (i in xx) {
 * 7:     if (z %% 2) ==
 *                    ^
 * >
 * >
 */

export async function r_format(
  input: string,
  options: ParserOptions,
  ext: string,
  logger: any
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(tmp.file, { postfix: `.${ext}` });
  try {
    await callback(writeFile, input_path, input);
    const variant: Variant = options.variant ? options.variant : "styler";

    // spawn the R formatter
    const r_formatter = formatR(input_path, variant);
    // stdout/err capture
    let stdout: string = "";
    let stderr: string = "";
    // read data as it is produced.
    r_formatter.stdout.on("data", data => (stdout += data.toString()));
    r_formatter.stderr.on("data", data => (stderr += data.toString()));
    // wait for subprocess to close.
    let code = await callback(close, r_formatter);
    // special case: return code 0 but warnings are errors, which we want to report back
    if (variant == "styler" && stderr.length > 0) {
      const err_msg = stderr
        .split("\n")
        .slice(1)
        .join("\n");
      logger.debug(`R_FORMAT: "${err_msg}"`);
      throw new Error(err_msg);
    }
    if (code) {
      const err_msg = stderr;
      logger.debug(`R_FORMAT: ${err_msg}`);
      throw new Error(err_msg);
    }

    // all fine, we read from the temp file
    let output: Buffer = await callback(readFile, input_path);
    let s: string = output.toString("utf-8");

    return s;
  } finally {
    unlink(input_path);
  }
}
