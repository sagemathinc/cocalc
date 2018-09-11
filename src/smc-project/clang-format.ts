const { writeFile, readFile } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { spawn } = require("child_process");
// const { replace_all } = require("smc-util/misc");

interface ParserOptions {
  parser: string;
  tabWidth: number;
}

function close(proc, cb): void {
  proc.on("close", code => cb(undefined, code));
}

// ref: https://clang.llvm.org/docs/ClangFormat.html

function run_clang_format(
  input_path: string,
  indent: number /*, logger: any*/
) {
  const style = `-style={BasedOnStyle: google, IndentWidth: ${indent}}`;
  const args = ["-i", style, input_path];
  // logger.debug(`run_clang_format args: [${args}]`);
  return spawn("clang-format", args);
}

export async function clang_format(
  input: string,
  options: ParserOptions,
  ext: string,
  logger: any
): Promise<string> {
  // create input temp file
  // we have to set the correct filename extension, because clang format uses it
  const input_path: string = await callback(tmp.file, { postfix: `.${ext}` });
  // logger.debug(`clang_format tmp file: ${input_path}`);
  await callback(writeFile, input_path, input);

  // spawn the html formatter
  let formatter;
  let indent = options.tabWidth || 2;

  switch (options.parser) {
    case "clang-format":
      formatter = run_clang_format(input_path, indent /*, logger*/);
      break;
    default:
      throw Error(`Unknown C/C++ code formatting utility '${options.parser}'`);
  }
  // stdout/err capture
  let stdout: string = "";
  let stderr: string = "";
  // read data as it is produced.
  formatter.stdout.on("data", data => (stdout += data.toString()));
  formatter.stderr.on("data", data => (stderr += data.toString()));
  // wait for subprocess to close.
  let code = await callback(close, formatter);
  if (code >= 1) {
    const err_msg = `C/C++ code formatting utility "${
      options.parser
    }" exited with code ${code}\nOutput:\n${stdout}\n${stderr}`;
    logger.debug(`clang-format error: ${err_msg}`);
    throw Error(err_msg);
  }

  // all fine, we read from the temp file
  let output: Buffer = await callback(readFile, input_path);
  let s: string = output.toString("utf-8");
  // logger.debug(`clang_format output s ${s}`);

  return s;
}
