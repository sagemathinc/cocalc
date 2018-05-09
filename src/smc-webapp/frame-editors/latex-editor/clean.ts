/*
 * Clean up all aux files.
 */

import { exec } from "../generic/client";
import { parse_path } from "../frame-tree/util";

const EXT: string[] = [
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
  "-concordance.tex"
];

export async function clean(
  project_id: string,
  path: string,
  logger: Function
) {
  const { directory, base } = parse_path(path);

  logger(`Running 'latexmk -f -c ${base}'\n`);
  let output = await exec({
    command: "latexmk",
    args: ["-f", "-c", base],
    project_id: project_id,
    path: directory
  });
  if (output) {
    logger(output.stdout + "\n" + output.stderr + "\n");
  }
  // this in particular gets rid of the sagetex files
  const files = EXT.map(ext => `${base}${ext}`);
  // -f: don't complain when it doesn't exist
  // --: then it works with filenames starting with a "-"
  const args = ["-v", "-f", "--"].concat(files);
  logger(`Removing ${files.join(", ")}`);
  output = await exec({
    command: "rm",
    args: args,
    project_id: project_id,
    path: directory
  });
  if (output) {
    logger(output.stdout + "\n" + output.stderr + "\n");
  }
}
