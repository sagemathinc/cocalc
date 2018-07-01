/*
Convert LaTeX file to PDF using latexmk.
*/

import { exec, ExecOutput } from "../generic/client";
import { path_split, change_filename_extension } from "../generic/misc";

export async function latexmk(
  project_id: string,
  path: string,
  build_command: string | string[],
  time: number | undefined, // (ms since epoch)  used to aggregate multiple calls into one across all users.
  status: Function
): Promise<ExecOutput> {
  const x = path_split(path);
  let bash: boolean;
  let command: string;
  let args: string[] | undefined;
  if (typeof build_command === "string") {
    bash = true;
    command = build_command;
    args = undefined;
    status(command);
  } else {
    bash = false;
    command = build_command[0];
    args = build_command.slice(1);
    status([command].concat(args).join(" "));
  }
  return await exec({
    bash: bash,
    allow_post: false, // definitely could take a long time to fully run latex
    timeout: 90,
    command: command,
    args: args,
    project_id: project_id,
    path: x.head,
    err_on_exit: false,
    aggregate: time
  });
}

export type Engine = "PDFLaTeX" | "XeLaTeX" | "LuaTex";

export function build_command(
  engine: Engine,
  filename: string,
  knitr: boolean
): string[] {
  /*
  errorstopmode recommended by
  http://tex.stackexchange.com/questions/114805/pdflatex-nonstopmode-with-tikz-stops-compiling
  since in some cases things will hang (using )
  return "pdflatex -synctex=1 -interact=errorstopmode '#{@filename_tex}'"
  However, users hate nostopmode, so we use nonstopmode, which can hang in rare cases with tikz.
  See https://github.com/sagemathinc/cocalc/issues/156
  */
  let name: string = "pdf";
  switch (engine) {
    case "PDFLaTeX":
      name = "pdf";
      break;
    case "XeLaTeX":
      name = "xelatex";
      break;
    case "LuaTex":
      name = "lualatex";
      break;
  }
  if (knitr) {
    filename = change_filename_extension(filename, "tex");
  }
  /*
    -f: force even when there are errors
    -g: ignore heuristics to stop processing latex (sagetex)
    silent: **don't** set -silent, also silences sagetex mesgs!
    bibtex: a default, run bibtex when necessary
    synctex: forward/inverse search in pdf
    nonstopmode: continue after errors (otherwise, partial files)
    */
  return [
    "latexmk",
    `-${name}`,
    "-f",
    "-g",
    "-bibtex",
    "-synctex=1",
    "-interaction=nonstopmode",
    filename
  ];
}
