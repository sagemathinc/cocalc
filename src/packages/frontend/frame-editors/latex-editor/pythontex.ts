/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Run PythonTeX
*/

import { parse_path } from "@cocalc/frontend/frame-editors/frame-tree/util";
import { ExecOutput } from "@cocalc/frontend/frame-editors/generic/client";
import { ExecuteCodeOutputAsync } from "@cocalc/util/types/execute-code";
import { Error as ErrorLog, ProcessedLatexLog } from "./latex-log-parser";
import { BuildLog } from "./types";
import { runJob } from "./util";

// command documentation
//
// we limit the number of jobs, could be bad for memory usage causing OOM or whatnot
// -j N, --jobs N        Allow N jobs at once; defaults to cpu_count().
//
// --rerun={never,modified,errors,warnings,always}
// This sets the threshold for re-executing code.
// By default, PythonTEX will rerun code that has been modified or that produced errors on the last run.
// "always" executes all code always

export async function pythontex(
  project_id: string,
  path: string,
  time: number,
  force: boolean,
  status: Function,
  output_directory: string | undefined,
  set_job_info: (info: ExecuteCodeOutputAsync) => void,
): Promise<ExecOutput> {
  const { base, directory } = parse_path(path);
  const rerun = force ? "--rerun=always" : ""; // forced build implies to run all snippets
  const args = `--jobs 2 ${rerun} '${base}'`;
  // older ubuntu versions install both, for python2&3. Newer Ubuntu's only install "pythontex" for python3. we prefer the "version 3" variant in both cases.
  // note: the "which" selection works, because "bash" is true
  const command = `$(which {pythontex3,pythontex} | head -1) ${args}`;
  status(`pythontex[3] ${args}`);
  const aggregate = time && !force ? { value: time } : undefined;

  return runJob({
    project_id,
    aggregate,
    command,
    rundir: output_directory || directory,
    set_job_info,
    // for python plots -- https://github.com/sagemathinc/cocalc/issues/4203
    env: { MPLBACKEND: "Agg" },
    path,
  });
}

/*
example of what we're after:
the line number on the first line is correct (in the tex file)

This is PythonTeX 0.16

----  Messages for py:default:default  ----
* PythonTeX stderr - error on line 19:
    File "<outputdir>/py_default_default.py", line 65
      print(pytex.formatter(34*131*))
                                   ^
  SyntaxError: invalid syntax

--------------------------------------------------
PythonTeX:  pytex-test - 1 error(s), 0 warning(s)
*/

export function pythontex_errors(
  file: string,
  output: BuildLog,
): ProcessedLatexLog {
  const pll = new ProcessedLatexLog();

  let err: ErrorLog | undefined = undefined;

  for (const line of output.stdout.split("\n")) {
    if (line.search("PythonTeX stderr") > 0) {
      const hit = line.match(/line (\d+):/);
      let line_no: number | null = null;
      if (hit !== null && hit.length >= 2) {
        line_no = parseInt(hit[1]);
      }
      err = {
        line: line_no,
        file,
        level: "error",
        message: line,
        content: "",
        raw: "",
      };
      pll.errors.push(err);
      pll.all.push(err);
      continue;
    }

    // collecting message until the end
    if (err != undefined) {
      if (line.startsWith("-----")) {
        break;
      }
      err.content += `${line}\n`;
    }
  }
  return pll;
}
