/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const { writeFile, unlink } = require("fs");
const tmp = require("tmp");
const { callback } = require("awaiting");
const { spawn } = require("child_process");
const { replace_all } = require("../smc-util/misc");

interface ParserOptions {
  parser: string;
  tabWidth?: number;
  useTabs?: boolean;
}

function close(proc, cb): void {
  proc.on("close", (code) => cb(undefined, code));
}

export async function latex_format(
  input: string,
  options: ParserOptions
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(tmp.file, { postfix: ".tex" });
  try {
    await callback(writeFile, input_path, input);
    // spawn the latexindent script.
    const latexindent = spawn("latexindent", [input_path]);
    let output: string = "";
    // read data as it is produced.
    latexindent.stdout.on("data", (data) => (output += data.toString()));
    // wait for subprocess to close.
    const code = await callback(close, latexindent);
    if (code) {
      throw Error(`latexindent exited with code ${code}`);
    }
    // now process the result according to the options.
    if (!options.useTabs) {
      // replace tabs by spaces
      let tab_width = 2;
      if (options.tabWidth !== undefined) {
        tab_width = options.tabWidth;
      }
      let SPACES = "";
      for (let i = 0; i < tab_width; i++) {
        SPACES += " ";
      }
      output = replace_all(output, "\t", SPACES);
    }
    // latexindent also annoyingly introduces a lot of whitespace lines.
    const lines: string[] = output.split("\n"),
      lines2: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/\S/.test(lines[i])) {
        lines2.push(lines[i]);
      } else {
        lines2.push("");
      }
      output = lines2.join("\n");
    }
    return output;
  } finally {
    unlink(input_path, () => {});
  }
}
