const { writeFile, readFile, unlink } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { execute_code } = require("smc-util-node/execute-code");
const { callback_opts } = require("smc-util/async-utils");

interface ParserOptions {
  parser: string;
}

// ref: man biber

async function biber(input_path, output_path) {
  const args = [
    "--tool",
    "--output-align",
    "--output-indent=2",
    "--output-fieldcase=lower",
    "--output-file",
    output_path,
    input_path,
  ];

  return await callback_opts(execute_code)({
    command: "biber",
    args: args,
    err_on_exit: false,
    bash: false,
    timeout: 20,
  });
}

export async function bib_format(
  input: string,
  options: ParserOptions,
  logger: any
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(tmp.file);
  const output_path: string = await callback(tmp.file);
  try {
    await callback(writeFile, input_path, input);

    // spawn the bibtex formatter
    let bib_formatter;
    try {
      switch (options.parser) {
        case "bib-biber":
          bib_formatter = await biber(input_path, output_path);
          break;
        default:
          throw Error(`Unknown XML formatter utility '${options.parser}'`);
      }
    } catch (e) {
      logger.debug(`Calling Bibtex formatter raised ${e}`);
      throw new Error(
        `Bibtex formatter broken or not available. Is '${options.parser}' installed?`
      );
    }

    const { exit_code, stdout, stderr } = bib_formatter;
    const code = exit_code;

    const problem = code >= 1;
    if (problem) {
      const msg = `Bibtex formatter "${options.parser}" exited with code ${code}\nOutput:\n${stdout}\n${stderr}`;
      throw Error(msg);
    }

    // all fine, we read from the temp file
    const output: Buffer = await callback(readFile, output_path);
    const s: string = output.toString("utf-8");
    return s;
  } finally {
    // logger.debug(`bibtex formatter done, unlinking ${input_path}`);
    unlink(input_path, () => {});
    unlink(output_path, () => {});
  }
}
