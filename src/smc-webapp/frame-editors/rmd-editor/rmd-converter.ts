/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Convert R Markdown file to hidden Markdown file, then read.
*/

// import { aux_file } from "../frame-tree/util";
import { path_split } from "smc-util/misc2";
import { exec, ExecOutput } from "../generic/client";

export async function convert(
  project_id: string,
  path: string,
  frontmatter: string,
  time?: number
): Promise<ExecOutput> {
  const x = path_split(path);
  const infile = x.tail;
  // console.log("frontmatter", frontmatter);
  let cmd: string;
  // https://www.rdocumentation.org/packages/rmarkdown/versions/1.10/topics/render
  // unless user specifies some self_contained value or user did set an explicit "output: ..." mode,
  // we disable it as a convenience (rough heuristic, but should be fine)
  if (
    frontmatter.indexOf("self_contained") >= 0 ||
    frontmatter.indexOf("output:") >= 0
  ) {
    // , output_file = '${outfile}'
    cmd = `rmarkdown::render('${infile}', output_format = NULL, run_pandoc = TRUE)`;
  } else {
    cmd = `rmarkdown::render('${infile}', output_format = NULL, run_pandoc = TRUE, output_options = list(self_contained = FALSE))`;
  }
  // console.log("rmd cmd", cmd);

  return await exec({
    timeout: 4 * 60,
    bash: true, // so timeout is enforced by ulimit
    command: "Rscript",
    args: ["-e", cmd],
    env: { MPLBACKEND: "Agg" }, // for python plots -- https://github.com/sagemathinc/cocalc/issues/4202
    project_id: project_id,
    path: x.head,
    err_on_exit: true,
    aggregate: time,
  });
}
