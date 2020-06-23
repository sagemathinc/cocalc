/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const { writeFile, readFile, unlink } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { execute_code } = require("smc-util-node/execute-code");
const { callback_opts } = require("smc-util/async-utils");

interface ParserOptions {
  parser: string;
}

// ref: http://tidy.sourceforge.net/docs/quickref.html

async function tidy(input_path) {
  const args = [
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
    try {
      switch (options.parser) {
        case "xml-tidy":
          xml_formatter = await tidy(input_path);
          break;
        default:
          throw Error(`Unknown XML formatter utility '${options.parser}'`);
      }
    } catch (e) {
      logger.debug(`Calling XML formatter raised ${e}`);
      throw new Error(
        `XML formatter broken or not available. Is '${options.parser}' installed?`
      );
    }

    const { exit_code, stdout, stderr } = xml_formatter;
    const code = exit_code;

    const problem = options.parser === "xml-tidy" ? code >= 2 : code >= 1;
    if (problem) {
      const msg = `XML formatter "${options.parser}" exited with code ${code}\nOutput:\n${stdout}\n${stderr}`;
      throw Error(msg);
    }

    // all fine, we read from the temp file
    const output: Buffer = await callback(readFile, input_path);
    const s: string = output.toString("utf-8");
    return s;
  } finally {
    // logger.debug(`xml formatter done, unlinking ${input_path}`);
    unlink(input_path, () => {});
  }
}
