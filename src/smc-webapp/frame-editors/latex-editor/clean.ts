/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * Clean up all aux files.
 */

import { exec } from "../generic/client";
import { parse_path } from "../frame-tree/util";

const EXTENSIONS: string[] = [
  ".aux",
  ".logger",
  ".bbl",
  ".fls",
  ".synctex.gz",
  ".sagetex.py",
  ".sagetex.sage",
  ".sagetex.sage.py",
  ".sagetex.scmd",
  ".sagetex.sout",
  ".pdfsync",
  "-concordance.tex",
  ".pytxcode",
  ".pgf-plot.gnuplot",
  ".pgf-plot.table",
];

export async function clean(
  project_id: string,
  path: string,
  delete_tex: boolean = false,
  logger: Function,
  output_directory: string | undefined
) {
  const { directory, base } = parse_path(path);

  logger(`Running 'latexmk -f -c ${base}'\n`);
  const latexmk_args = ["-f", "-c", base];
  if (output_directory != null) {
    latexmk_args.push(`-output-directory=${output_directory}`);
  }
  let output = await exec({
    command: "latexmk",
    args: latexmk_args,
    project_id: project_id,
    path: directory,
  });
  if (output) {
    logger(output.stdout + "\n" + output.stderr + "\n");
  }
  // this in particular gets rid of the sagetex files
  let exts = EXTENSIONS;
  if (delete_tex) {
    // this looks weird, but in case of .rnw/.rtex, Knitr generates the .tex file
    exts = exts.concat(".tex");
  }
  let files = exts.map((ext) => `${base}${ext}`);

  // for PythonTeX, we need to derive the cache directory path
  // https://github.com/sagemathinc/cocalc/issues/3228
  // it also converts spaces to dashes, see #3229
  const pytexdir = `pythontex-files-${base.replace(/ /g, "-")}`;
  files = files.concat(pytexdir);

  // -f: don't complain when it doesn't exist
  // --: then it works with filenames starting with a "-"
  const args = ["-v", "-f", "-r", "--"].concat(files);
  logger(`Removing ${files.join(", ")}`);
  output = await exec({
    command: "rm",
    args: args,
    project_id: project_id,
    path: directory,
  });
  if (output) {
    logger(output.stdout + "\n" + output.stderr + "\n");
  }
}
