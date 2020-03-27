const { writeFile, readFile, unlink } = require("fs");
const tmp = require("tmp");
const { execute_code } = require("smc-util-node/execute-code");
const { callback } = require("awaiting");
const { callback_opts } = require("smc-util/async-utils");

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
    // enable it, if we want to show warnings upon exit code == 1
    "--show-warnings",
    "no",
    "--tidy-mark",
    "no",
    // https://github.com/sagemathinc/cocalc/issues/3867
    "--drop-empty-elements",
    "no",
    "--drop-empty-paras",
    "no",
    input_path,
  ];

  return await callback_opts(execute_code)({
    command: "tidy",
    args: args,
    err_on_exit: false,
    bash: false,
    timeout: 15,
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
    let html_formatter;

    try {
      // run the selected html formatter
      switch (options.parser) {
        case "html-tidy":
        case "tidy":
          html_formatter = await tidy(input_path);
          break;
        default:
          throw Error(`Unknown HTML formatter utility '${options.parser}'`);
      }
    } catch (e) {
      logger.debug(`Calling formatter raised ${e}`);
      throw new Error(
        `HTML formatter broken or not available. Is '${options.parser}' installed?`
      );
    }

    const { exit_code, stdout, stderr } = html_formatter;
    const code = exit_code;
    // logger.debug("html_format: code, stdout, stderr", code, stdout, stderr);
    // TODO exit code 1 is a "warning", which requires show-warnings yes
    const problem = options.parser === "html-tidy" ? code >= 2 : code >= 1;
    if (problem) {
      throw Error(
        `HTML formatter "${
          options.parser
        }" exited with code ${code}\nOutput:\n${[stdout, stderr].join("\n")}`
      );
    }

    // all fine, we read from the temp file
    const output: Buffer = await callback(readFile, input_path);
    const s: string = output.toString("utf-8");
    return s;
  } finally {
    // logger.debug(`html formatter done, unlinking ${input_path}`);
    unlink(input_path, () => {});
  }
}
