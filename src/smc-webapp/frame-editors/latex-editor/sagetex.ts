/*
Run sagetex

- TODO: this might be better done always as part of latexmk; not sure.
*/

import { exec, ExecOutput } from "../generic/client";
import { parse_path } from "../frame-tree/util";
import { ProcessedLatexLog, Error } from "./latex-log-parser";
import { BuildLog } from "./actions";

function sagetex_file(base: string): string {
  return base + ".sagetex.sage";
}

export async function sagetex_hash(
  project_id: string,
  path: string,
  time: number,
  status: Function,
  output_directory: string | undefined
): Promise<string> {
  const { base, directory } = parse_path(path); // base, directory, filename
  const s = sagetex_file(base);
  status(`sha1sum ${s}`);
  const output = await exec({
    allow_post: true, // very quick computation of sha1 hash
    timeout: 10,
    command: "sha1sum",
    args: [s],
    project_id: project_id,
    path: output_directory || directory,
    err_on_exit: true,
    aggregate: time
  });
  return output.stdout.split(" ")[0];
}

export async function sagetex(
  project_id: string,
  path: string,
  hash: string,
  status: Function,
  output_directory: string | undefined
): Promise<ExecOutput> {
  const { base, directory } = parse_path(path); // base, directory, filename
  const s = sagetex_file(base);
  status(`sage ${s}`);
  return exec({
    allow_post: false, // definitely could take a long time to fully run sage
    timeout: 360,
    bash: true, // so timeout is enforced by ulimit
    command: "sage",
    args: [s],
    project_id: project_id,
    path: output_directory || directory,
    err_on_exit: false,
    aggregate: hash ? { value: hash } : undefined
  });
}

/* example error
 *
 *    File "sagetex.sagetex.sage.py", line 16
 *     _st_.inline(_sage_const_1 , latex(_sage_const_3p2 .2))
 *                                                        ^
 * SyntaxError: invalid
 */

export function sagetex_errors(
  file: string,
  output: BuildLog
): ProcessedLatexLog {
  const pll = new ProcessedLatexLog();

  let err: Error | undefined = undefined;

  // all fine
  if (output.stderr.indexOf("Sage processing complete") >= 0) {
    return pll;
  }

  for (const line of output.stderr.split("\n")) {
    if (line.trim().length > 0) {
      // we create an error and then we collect lines
      if (err == null) {
        err = {
          line: null,
          file,
          level: "error",
          message: line,
          content: "",
          raw: ""
        };
        pll.errors.push(err);
        pll.all.push(err);
      }
      err.content += `${line}\n`;
      // last line is probably the most interesting one
      err.message = line;
    } else {
      // end of block
      err = undefined;
    }
  }
  return pll;
}
