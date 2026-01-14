/*
 *  This file is part of CoCalc: Copyright © 2020-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Run sagetex

- TODO: this might be better done always as part of latexmk; not sure.
*/

import { parse_path } from "@cocalc/frontend/frame-editors/frame-tree/util";
import {
  exec,
  ExecOutput,
} from "@cocalc/frontend/frame-editors/generic/client";
import { ExecuteCodeOutputAsync } from "@cocalc/util/types/execute-code";
import { Error as ErrorLog, ProcessedLatexLog } from "./latex-log-parser";
import { BuildLog } from "./types";
import { runJob } from "./util";

function sagetex_file(base: string): string {
  return base + ".sagetex.sage";
}

export async function sagetex_hash(
  project_id: string,
  path: string,
  time: number,
  status: Function,
  output_directory: string | undefined,
): Promise<string> {
  const { base, directory } = parse_path(path); // base, directory, filename
  const s = sagetex_file(base);
  status(`sha1sum ${s}`);

  // Check if file exists and compute hash only if it does; otherwise return unique value
  const output = await exec(
    {
      timeout: 10,
      command: `test -f '${s}' && sha1sum '${s}' || true`,
      bash: true,
      project_id: project_id,
      path: output_directory || directory,
      err_on_exit: false,
      aggregate: time,
    },
    path,
  );

  // If file doesn't exist, return unique timestamp-based value to ensure rebuild
  if (!output.stdout.trim()) {
    return `missing-${Date.now()}`;
  }

  return output.stdout.split(" ")[0];
}

export async function sagetex(
  project_id: string,
  path: string,
  hash: string,
  status: Function,
  output_directory: string | undefined,
  set_job_info: (info: ExecuteCodeOutputAsync) => void,
): Promise<ExecOutput> {
  const { base, directory } = parse_path(path); // base, directory, filename
  const s = sagetex_file(base);
  status(`sage ${s}`);

  return runJob({
    project_id,
    command: "sage",
    args: [s],
    set_job_info,
    runDir: output_directory || directory,
    aggregate: hash ? { value: hash } : undefined,
    path,
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
  output: BuildLog,
): ProcessedLatexLog {
  const pll = new ProcessedLatexLog();

  let err: ErrorLog | undefined = undefined;

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
          raw: "",
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
