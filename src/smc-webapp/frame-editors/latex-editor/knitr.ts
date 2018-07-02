/*
Run Rweave on rnw files
*/

import { exec, ExecOutput } from "../generic/client";
import { parse_path } from "../frame-tree/util";
import { ProcessedLatexLog, Error } from "./latex-log-parser";
import { BuildLog } from "./actions";

// this still respects the environment variables and init files
const R_CMD = "R --no-save --no-restore --quiet --no-readline";

export async function knitr(
  project_id: string,
  path: string, // pass in this.filename_rnw
  time: number | undefined,
  status: Function
): Promise<ExecOutput> {
  const { directory, filename } = parse_path(path);
  const cmd: string = `echo 'require(knitr); opts_knit$set(concordance = TRUE, progress = FALSE); knit("${filename}")' | ${R_CMD}`;
  status(`running ${cmd}`);
  return exec({
    allow_post: false, // definitely could take a long time to fully run Knitr
    timeout: 360,
    command: cmd,
    bash: true,
    project_id: project_id,
    path: directory,
    err_on_exit: false,
    aggregate: time ? { value: time } : undefined // one might think to aggregate on hash, but the output could be random!
  });
}

/**
Knitr error example:

Testing a few cases, it looks like we should report everything after the line "Error in..."
In case of multiple errors, only the first error is reported.
There is not much sense with parsing the lines, because usually they aren't reported.
Warnings are always below and start with a line ending in "Warning message:".

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
  const all: Error[] = [];
  const errors: Error[] = [];
  const warnings: Error[] = [];
  const typesetting: Error[] = [];

  let file: string = "";
  let err: Error | undefined = undefined;

  const warnmsg = "Warning message:";

  for (let line of output.stderr.split("\n")) {
    if (line.search("Error") == 0) {
      err = {
        line: null,
        file: `${file}`,
        level: "error",
        message: line,
        content: "",
        raw: ""
      };
      errors.push(err);
      all.push(err);
      continue;
    }
    if (line.substring(line.length - warnmsg.length) == warnmsg) {
      err = {
        line: null,
        file: `${file}`,
        level: "warning",
        message: line,
        content: "",
        raw: ""
      };
      warnings.push(err);
      all.push(err);
      continue;
    }
    if (line.search("processing file:") == 0) {
      file = line.substring("processing file:".length).trim();
    }
    if (err != undefined) {
      err.content += `${line}\n`;
    }
  }
  return {
    errors,
    warnings,
    typesetting,
    all,
    files: []
  };
}

export async function patch_synctex(
  project_id: string,
  path: string, // pass in the actual .tex file path
  time: number | undefined,
  status: Function
) {
  const { directory, filename } = parse_path(path);
  const cmd = `echo 'require(patchSynctex); patchSynctex("${filename}");' | ${R_CMD}`;
  status(`running ${cmd}`);
  return exec({
    allow_post: true,
    timeout: 10,
    command: cmd,
    bash: true,
    project_id: project_id,
    path: directory,
    err_on_exit: false,
    aggregate: time ? { value: time } : undefined
  });
}
