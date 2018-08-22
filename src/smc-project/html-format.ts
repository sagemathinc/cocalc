const { writeFile, readFile } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { spawn } = require("child_process");
// const { replace_all } = require("smc-util/misc");

interface ParserOptions {
  parser: string;
}

function close(proc, cb): void {
  proc.on("close", code => cb(undefined, code));
}

// the long list of options looks scary, but it is based on testing it.
// e.g. that it doesn't introduce a "full" <html></html> document, as long as there is no <body> tag.
// also, the "indent" formatting of codemirror is similar to the indentation here.
// ref: http://tidy.sourceforge.net/docs/quickref.html

function tidy(input_path) {
  return spawn("tidy", [
    "-modify",
    "--show-body-only",
    "auto",
    "--indent",
    "yes",
    "--vertical-space",
    "yes",
    "--break-before-br",
    "yes",
    "--indent-spaces",
    "2",  // tune that if we let users ever choose the indentation
    "--wrap",
    "80",
    "--sort-attributes",
    "alpha",
    "--quiet",
    "yes",
    "--write-back",
    "yes",
    "--show-warnings",
    "no",
    input_path
  ]);
}

export async function html_format(
  input: string,
  options: ParserOptions
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(tmp.file);
  await callback(writeFile, input_path, input);

  // spawn the html formatter
  const html_formatter;
  switch (options.parser) {
    case "tidy-html":
      html_formatter = tidy(input_path);
      break;
    default:
      throw Error(`Unkown HTML formatter utility '${options.parser}'`);
  }
  // stdout/err capture
  let stdout: string = "";
  let stderr: string = "";
  // read data as it is produced.
  html_formatter.stdout.on("data", data => (stdout += data.toString()));
  html_formatter.stderr.on("data", data => (stderr += data.toString()));
  // wait for subprocess to close.
  let code = await callback(close, html_formatter);
  if (code) {
    throw Error(
      `HTML formatter "${
        options.parser
      }" exited with code ${code}\nOutput:\n${stdout}\n${stderr}`
    );
  }

  // all fine, we read from the temp file
  let output: Buffer = await callback(readFile, input_path);
  let s: string = output.toString("utf-8");

  return s;
}
