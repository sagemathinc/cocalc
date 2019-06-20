/*
Convert LaTeX file to PDF using latexmk.
*/

import { exec, ExecOutput } from "../generic/client";
import { path_split, change_filename_extension } from "smc-util/misc2";

export async function latexmk(
  project_id: string,
  path: string,
  build_command: string | string[],
  time: number | undefined, // (ms since epoch)  used to aggregate multiple calls into one across all users.
  status: Function
): Promise<ExecOutput> {
  const x = path_split(path);
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
  return await exec({
    bash: true, // we use ulimit so that the timeout on the backend is *enforced* via ulimit!!
    allow_post: false, // definitely could take a long time to fully run latex
    timeout: 4 * 60, // 4 minutes, on par with Overleaf
    command: command,
    args: args,
    project_id: project_id,
    path: x.head,
    err_on_exit: false,
    aggregate: time
  });
}

export type Engine =
  | "PDFLaTeX"
  | "PDFLaTeX (shell-escape)"
  | "XeLaTeX"
  | "LuaTex";

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
      return "LuaTex";
  }
  return null;
}

export function build_command(
  engine: Engine,
  filename: string,
  knitr: boolean
): string[] {
  /*
  errorstopmode recommended by
  http://tex.stackexchange.com/questions/114805/pdflatex-nonstopmode-with-tikz-stops-compiling
  since in some cases things will hang using
  return "pdflatex -synctex=1 -interact=errorstopmode '#{@filename_tex}'"
  However, users hate errorstopmode, so we use nonstopmode, which can hang in rare cases with tikz.
  See https://github.com/sagemathinc/cocalc/issues/156
  */
  const name: string = (function() {
    switch (engine) {
      case "PDFLaTeX":
      case "PDFLaTeX (shell-escape)":
        return "pdf";
      case "XeLaTeX":
        return "xelatex";
      case "LuaTex":
        return "lualatex";
      default:
        console.warn(
          `LaTeX engine ${engine} unknown -- switching to fallback "PDFLaTeX"`
        );
        return "pdf";
    }
  })();

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
  const head = ["latexmk"];

  // shell escape is potentially dangerous, but pretty much save when tamed inside a cocalc project
  if (engine == ("PDFLaTeX (shell-escape)" as Engine)) {
    head.push("-e");
    // yes, this is in one piece. in a shell it would be enclosed in '...'
    head.push("$pdflatex=q/pdflatex %O -shell-escape %S/");
  }

  const tail = [
    `-${name}`,
    "-f",
    "-g",
    "-bibtex",
    "-synctex=1",
    "-interaction=nonstopmode",
    filename
  ];

  return head.concat(tail);
}
