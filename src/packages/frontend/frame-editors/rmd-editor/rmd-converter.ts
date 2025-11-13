/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Convert R Markdown file to hidden Markdown file, then read.
*/

import { path_split } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { ExecOutput } from "../generic/client";
import { ExecuteCodeOutputAsync } from "@cocalc/util/types/execute-code";
import { runJob } from "./utils";

export const convert = reuseInFlight(_convert);

async function _convert(
  project_id: string,
  path: string,
  frontmatter: string,
  hash,
  set_job_info?: (info: ExecuteCodeOutputAsync) => void,
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
    cmd = `rmarkdown::render('${infile}', output_format = NULL, run_pandoc = TRUE)`;
  } else {
    cmd = `rmarkdown::render('${infile}', output_format = NULL, run_pandoc = TRUE, output_options = list(self_contained = FALSE))`;
  }

  return await runJob({
    aggregate: hash ? { value: hash } : undefined,
    args: ["-e", cmd],
    command: "Rscript",
    env: { MPLBACKEND: "Agg" }, // for python plots -- https://github.com/sagemathinc/cocalc/issues/4202
    project_id: project_id,
    runDir: x.head,
    set_job_info,
    timeout: 4 * 60,
    path: path,
    debug: `RMD conversion for: ${path}`,
  });
}
