/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Convert LaTeX file to PDF using latexmk.
*/

import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import type { ExecOutput } from "@cocalc/util/db-schema/projects";
import { change_filename_extension, path_split } from "@cocalc/util/misc";
import { ExecuteCodeOutputAsync } from "@cocalc/util/types/execute-code";
import { pdf_path, runJob } from "./util";

export async function latexmk(
  project_id: string,
  path: string,
  build_command: string | string[],
  time: number | undefined, // (ms since epoch)  used to aggregate multiple calls into one across all users.
  status: Function,
  output_directory: string | undefined,
  set_job_info: (info: ExecuteCodeOutputAsync) => void,
): Promise<ExecOutput> {
  const { head, tail } = path_split(path);
  let command: string;
  let args: string[] | undefined;
  if (typeof build_command === "string") {
    command = build_command;
    args = undefined;
    status(command);
  } else {
    command = build_command[0];
    args = build_command.slice(1);
    status([command].concat(args).join(" "));
  }

  // Step 1: Wait for the launched job to finish
  const output = await runJob({
    project_id,
    command,
    args,
    runDir: head,
    aggregate: time,
    set_job_info,
    path,
  });

  // Step 2: do a copy operation, if we run this in an output_directory (somewhere in /tmp)
  if (output_directory != null) {
    // We use cp instead of `ln -sf` so the file persists after project restart.
    // Using a symlink would be faster and more efficient *while editing*,
    // but would likely cause great confusion otherwise.
    try {
      await exec(
        {
          project_id,
          bash: false,
          command: "cp",
          path: head,
          args: [`${output_directory}/${pdf_path(tail)}`, "."],
        },
        path,
      );
    } catch (err) {
      // good reasons this could fail (due to err_on_exit above), e.g., no pdf produced.
    }
  }

  return output;
}

type BuildCommandName = "pdf" | "xelatex" | "lualatex";

export const NO_OUTPUT_DIR = "(no output dir)";

export const ENGINES = [
  "PDFLaTeX",
  `PDFLaTeX ${NO_OUTPUT_DIR}`,
  "PDFLaTeX (shell-escape)",
  "XeLaTeX",
  `XeLaTeX ${NO_OUTPUT_DIR}`,
  "LuaTex",
  `LuaTex ${NO_OUTPUT_DIR}`,
  "<disabled>",
] as const;

export type Engine = (typeof ENGINES)[number];

export function get_engine_from_config(config: string): Engine | null {
  switch (config.toLowerCase()) {
    case "latex":
    case "pdflatex":
      return "PDFLaTeX";

    case "xelatex":
    case "xetex":
      return "XeLaTeX";

    case "lua":
    case "luatex":
    case "lualatex":
      return "LuaTex";
  }
  return null;
}

function build_command_name(engine: Engine): BuildCommandName {
  switch (engine) {
    case "PDFLaTeX":
    case "PDFLaTeX (shell-escape)":
    case `PDFLaTeX ${NO_OUTPUT_DIR}`:
      return "pdf";
    case "XeLaTeX":
    case `XeLaTeX ${NO_OUTPUT_DIR}`:
      return "xelatex";
    case "LuaTex":
    case `LuaTex ${NO_OUTPUT_DIR}`:
      return "lualatex";
    default:
      console.warn(
        `LaTeX engine ${engine} unknown -- switching to fallback "PDFLaTeX"`,
      );
      return "pdf";
  }
}

export function build_command(
  engine: Engine,
  filename: string,
  knitr: boolean,
  output_directory: string | undefined, // probably should not require special escaping.
): string[] {
  // special case: disable build
  // the ; is important, see actions::sanitize_build_cmd_str
  if (engine == "<disabled>") return ["false;"];

  /*
  errorstopmode recommended by
  http://tex.stackexchange.com/questions/114805/pdflatex-nonstopmode-with-tikz-stops-compiling
  since in some cases things will hang using
  return "pdflatex -synctex=1 -interact=errorstopmode '#{@filename_tex}'"
  However, users hate errorstopmode, so we use nonstopmode, which can hang in rare cases with tikz.
  See https://github.com/sagemathinc/cocalc/issues/156
  */

  if (knitr) {
    filename = change_filename_extension(filename, "tex");
  }
  const head = ["latexmk"];

  // shell escape is potentially dangerous, but pretty much save when tamed inside a cocalc project
  if (engine == ("PDFLaTeX (shell-escape)" as Engine)) {
    head.push("-e");
    // yes, this is in one piece. in a shell it would be enclosed in '...'
    head.push("$pdflatex=q/pdflatex %O -shell-escape %S/");
    // Don't want this since typically if shell-escape is needed, then
    // the current directory is very relevant.
    output_directory = undefined;
  }

  // we allow the user to easily disable the output_directory
  // https://github.com/sagemathinc/cocalc/issues/5910
  if (engine.endsWith(NO_OUTPUT_DIR)) {
    output_directory = undefined;
  }

  /*
    -f: force even when there are errors
    -g: ignore heuristics to stop processing latex (sagetex)
    silent: **don't** set -silent, also silences sagetex messages!
    bibtex: a default, run bibtex when necessary
    synctex: forward/inverse search in pdf
    nonstopmode: continue after errors (otherwise, partial files)
    */
  const tail = [
    `-${build_command_name(engine)}`,
    "-f",
    "-g",
    "-bibtex",
    "-deps",
    "-synctex=1",
    "-interaction=nonstopmode",
  ];
  if (!knitr && output_directory != null) {
    tail.push(`-output-directory=${output_directory}`);
  }
  tail.push(filename);

  return head.concat(tail);
}
