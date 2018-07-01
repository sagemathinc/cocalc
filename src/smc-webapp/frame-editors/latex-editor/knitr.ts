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

export function knitr_errors(output: BuildLog): ProcessedLatexLog {
  let i = 0;

  const all: Error[] = [];
  const errors: Error[] = [];
  const warnings: Error[] = [];
  const typesetting: Error[] = [];

  let file: string = "";

  for (let line of output.stderr.split("\n")) {
    console.log(`line ${i}: ${line}`);
    if (line.search("Error") == 0) {
      let e: Error = {
        line: null,
        file: `./${file}`,
        level: "error",
        message: "ERROR PROC",
        content: "test error",
        raw: ""
      };
      file = "";
      errors.push(e);
      all.push(e);
      continue;
    }
    if (line.search("processing file:") == 0) {
      file = line.substring("processing file:".length).trim();
    }
    i += 1;
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
