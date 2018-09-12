/*
Run PythonTeX
*/

import { exec, ExecOutput } from "../generic/client";
import { parse_path } from "../frame-tree/util";
import { ProcessedLatexLog, Error } from "./latex-log-parser";
import { BuildLog } from "./actions";

// command documentation
//
// we limit the number of jobs, could be bad for memory usage causing OOM or whatnot
// -j N, --jobs N        Allow N jobs at once; defaults to cpu_count().

export async function pythontex(
  project_id: string,
  path: string,
  time: number,
  status: Function
): Promise<ExecOutput> {
  const { base, directory } = parse_path(path);
  const args = ["--jobs", "2", base];
  status(`pythontex ${args.join(" ")}`);
  return exec({
    allow_post: false, // definitely could take a long time to fully run this
    timeout: 360,
    bash: true, // timeout is enforced by ulimit
    command: "pythontex3",
    args: args,
    project_id: project_id,
    path: directory,
    err_on_exit: false,
    aggregate: time ? { value: time } : undefined
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

export function pythontex_errors(path: string, output: BuildLog): ProcessedLatexLog {
  const pll = new ProcessedLatexLog();

  let err: Error | undefined = undefined;

  for (let line of output.stdout.split("\n")) {
    if (line.search("PythonTeX stderr") > 0) {
      const hit = line.match(/line (\d+):/);
      let line_no: number | null = null;
      if (hit !== null && hit.length >= 2) {
        line_no = parseInt(hit[1]);
      }
      err = {
        line : line_no,
        file: path,
        level: "error",
        message: line,
        content: "",
        raw: ""
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
