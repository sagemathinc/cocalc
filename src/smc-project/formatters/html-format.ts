const { writeFile, readFile, unlink } = require("fs");
const tmp = require("tmp");
const { execute_code } = require("smc-util-node/execute-code");
const { callback } = require("awaiting");
const {
  callback_opts
} = require("smc-webapp/frame-editors/generic/async-utils");

interface ParserOptions {
  parser: string;
}

// the long list of options looks scary, but it is based on testing it.
// e.g. that it doesn't introduce a "full" <html></html> document, as long as there is no <body> tag.
// also, the "indent" formatting of codemirror is similar to the indentation here.
// ref: http://tidy.sourceforge.net/docs/quickref.html

async function tidy(input_path) {
  const args = [
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
  ];
  return await callback_opts(execute_code)({
    command: "tidy",
    args: args,
    err_on_exit: false,
    bash: false,
    timeout: 15
  });
}

export async function html_format(
  input: string,
  options: ParserOptions,
  logger: any
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(tmp.file);
  try {
    await callback(writeFile, input_path, input);

    // run the selected html formatter
    let html_formatter;
    try {
      switch (options.parser) {
        case "html-tidy":
        case "tidy":
          html_formatter = await tidy(input_path);
          break;
        default:
          throw Error(`Unknown HTML formatter utility '${options.parser}'`);
      }
    } catch (e) {
      logger.log("html_format error:", e);
       throw new Error(
        `HTML formatter broken or not available. Is '${
          options.parser
        }' installed?}`
      );
    }

    const { code, stdout, stderr } = html_formatter;
    // logger.log("code, stdout, stderr", code, stdout, stderr);
    // TODO exit code 1 is a "warning", which requires show-warnings yes
    if (code >= 2) {
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
  } finally {
    logger.debug(`html formatter done, unlinking ${input_path}`);
    unlink(input_path);
  }
}
