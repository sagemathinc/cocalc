const { writeFile, readFile, unlink } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { spawn } = require("child_process");

interface ParserOptions {
  parser: string;
}

function close(proc, cb): void {
  proc.on("close", code => cb(undefined, code));
}

// ref: http://tidy.sourceforge.net/docs/quickref.html

function tidy(input_path) {
  return spawn("tidy", [
    "-modify",
    "-xml",
    "--indent",
    "yes",
    "--vertical-space",
    "yes",
    "--indent-spaces",
    "2", // tune that if we let users ever choose the indentation
    "--wrap",
    "80",
    "--sort-attributes",
    "alpha",
    "--quiet",
    "yes",
    "--write-back",
    "yes",
    "--show-warnings",
    "no", // enable it, if we want to show warnings upon exit code == 1
    "--tidy-mark",
    "no",
    input_path
  ]);
}

export async function xml_format(
  input: string,
  options: ParserOptions,
  logger: any
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(tmp.file);
  try {
    await callback(writeFile, input_path, input);

    // spawn the html formatter
    let xml_formatter;
    switch (options.parser) {
      case "xml-tidy":
        xml_formatter = tidy(input_path);
        break;
      default:
        throw Error(`Unknown XML formatter utility '${options.parser}'`);
    }
    // stdout/err capture
    let stdout: string = "";
    let stderr: string = "";
    // read data as it is produced.
    xml_formatter.stdout.on("data", data => (stdout += data.toString()));
    xml_formatter.stderr.on("data", data => (stderr += data.toString()));
    // wait for subprocess to close.
    let code = await callback(close, xml_formatter);
    // TODO exit code 1 is a "warning", which requires show-warnings yes
    const problem = options.parser === "xml-tidy" ? code >= 2 : code >= 1;
    if (problem) {
      const msg = `XML formatter "${
        options.parser
      }" exited with code ${code}\nOutput:\n${stdout}\n${stderr}`;
      logger.warn(msg);
      throw Error(msg);
    }

    // all fine, we read from the temp file
    let output: Buffer = await callback(readFile, input_path);
    let s: string = output.toString("utf-8");

    return s;
  } finally {
    unlink(input_path);
  }
}
