/*
Run Knitr on rnw/rtex files
*/

import { exec, ExecOutput } from "../generic/client";
import { parse_path } from "../frame-tree/util";
import { ProcessedLatexLog, Error } from "./latex-log-parser";
import { BuildLog } from "./actions";

// this still respects the environment variables and init files
const R_CMD = "R";
const R_ARGS: ReadonlyArray<string> = [
  "--no-save",
  "--no-restore",
  "--quiet",
  "--no-readline",
  "-e",
];

export async function knitr(
  project_id: string,
  path: string, // pass in this.filename_knitr
  time: number | undefined,
  status: Function
): Promise<ExecOutput> {
  const { directory, filename } = parse_path(path);
  const expr = `require(knitr); opts_knit$set(concordance = TRUE, progress = FALSE); knit("${filename}")`;
  status(`${expr}`);
  return exec({
    allow_post: false, // definitely could take a long time to fully run Knitr
    timeout: 360,
    command: R_CMD,
    args: [...R_ARGS, expr],
    bash: true, // so timeout is enforced by ulimit
    project_id: project_id,
    path: directory,
    err_on_exit: false,
    aggregate: time ? { value: time } : undefined, // one might think to aggregate on hash, but the output could be random!
  });
}

/**
Knitr error example:

Testing a few cases, it looks like we should report everything after the line "Error in..."
In case of multiple errors, only the first error is reported.
Warnings are always below and start with a line ending in "Warning message:".
The lines are reported as "Quitting from lines ...", we parse the first line number.

Loading required package: knitr
processing file: test2.rnw
Error in parse(text = code, keep.source = FALSE) :
  <text>:1:29: unexpected symbol
1: x <- c(2,3,4,5,1,2,3,3,3,3,4a
                                ^
Quitting from lines 26-101 (test2.rnw)
Error in paste(x, collapse = "+") : object 'x' not found
Calls: knit ... inline_exec -> hook_eval -> withVisible -> eval -> eval -> paste
In addition: Warning message:
In highr::hilight(x, format, prompt = options$prompt, markup = opts$markup) :
  the syntax of the source code is invalid; the fallback mode is used
Execution halted
**/

export function knitr_errors(output: BuildLog): ProcessedLatexLog {
  const pll = new ProcessedLatexLog();

  let file: string = "";
  let err: Error | undefined = undefined;

  const warnmsg = "Warning message:";
  const errline = "Quitting from lines ";

  for (const line of output.stderr.split("\n")) {
    if (line.search("Error") == 0) {
      err = {
        line: null,
        file: `${file}`,
        level: "error",
        message: line,
        content: "",
        raw: "",
      };
      pll.errors.push(err);
      pll.all.push(err);
      continue;
    }
    if (line.substring(line.length - warnmsg.length) == warnmsg) {
      err = {
        line: null,
        file: `${file}`,
        level: "warning",
        message: line,
        content: "",
        raw: "",
      };
      pll.warnings.push(err);
      pll.all.push(err);
      continue;
    }
    if (line.search("processing file:") == 0) {
      file = line.substring("processing file:".length).trim();
    }
    // try to parse the line where the error is
    if (err != null && line.indexOf(errline) == 0) {
      try {
        const info = line.substring(errline.length).split(" ")[0];
        const line_no = info.split("-")[0];
        if (line_no.search(/\d+/) == 0) {
          err.line = parseInt(line_no);
        }
      } catch (err) {
        // console.log("knitr_errors: unable to parse error line:", line, err);
      }
    }
    if (err != undefined) {
      err.content += `${line}\n`;
    }
  }
  return pll;
}

export async function patch_synctex(
  project_id: string,
  path: string, // pass in the actual .tex file path
  time: number | undefined,
  status: Function
) {
  const { directory, filename } = parse_path(path);
  const expr = `require(patchSynctex); patchSynctex("${filename}")`;
  status(`${expr}`);
  return exec({
    allow_post: true,
    timeout: 10,
    command: R_CMD,
    args: [...R_ARGS, expr],
    bash: false,
    project_id: project_id,
    path: directory,
    err_on_exit: false,
    aggregate: time ? { value: time } : undefined,
  });
}
