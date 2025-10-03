/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Convert Quarto Markdown file (similar to Rmd) to html or pdf
*/

import { path_split } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { ExecOutput } from "../generic/client";
import { runJob } from "../rmd-editor/utils";

export const convert: (opts: Opts) => Promise<ExecOutput> =
  reuseInFlight(_convert);

const LOG = ["--log-level", "info"] as const;

interface Opts {
  project_id: string;
  path: string;
  frontmatter: string;
  hash: string | number;
  set_job_info?: (info: any) => void;
}

async function _convert(opts: Opts): Promise<ExecOutput> {
  const { project_id, path, hash, set_job_info } = opts;
  const x = path_split(path);
  const infile = x.tail;
  const args = ["render", infile, ...LOG];

  return await runJob({
    aggregate: hash ? { value: hash } : undefined,
    args,
    command: "quarto",
    project_id,
    runDir: x.head,
    set_job_info,
    timeout: 4 * 60,
    path,
    debug: `QMD conversion for: ${path}`,
  });
}
