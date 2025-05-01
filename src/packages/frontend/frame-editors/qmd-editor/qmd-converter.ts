/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Convert Quarto Markdown file (similar to Rmd) to html or pdf
*/

import { path_split } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { exec, ExecOutput } from "../generic/client";

export const convert: (opts: Opts) => Promise<ExecOutput> =
  reuseInFlight(_convert);

const LOG = ["--log-level", "info"] as const;

interface Opts {
  project_id: string;
  path: string;
  frontmatter: string;
  hash: string;
}

async function _convert(opts: Opts): Promise<ExecOutput> {
  const { project_id, path, hash } = opts;
  const x = path_split(path);
  const infile = x.tail;
  const args = ["render", infile, ...LOG];

  return await exec(
    {
      timeout: 4 * 60,
      bash: true, // so timeout is enforced by ulimit
      command: "quarto",
      args,
      project_id,
      path: x.head,
      err_on_exit: false,
      aggregate: { value: hash },
    },
    path,
  );
}
