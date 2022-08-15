/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Convert Quarto Markdown file (similar to Rmd) to html or pdf
*/

import { path_split } from "@cocalc/util/misc";
import { reuseInFlight } from "async-await-utils/hof";
import { exec, ExecOutput } from "../generic/client";

export const convert = reuseInFlight(_convert);

const LOG = ["--log-level", "info"] as const;

async function _convert(
  project_id: string,
  path: string,
  // frontmatter: string,
  hash
): Promise<ExecOutput> {
  const x = path_split(path);
  const infile = x.tail;
  const args = ["render", infile, "--to", "html", ...LOG];

  return await exec({
    timeout: 4 * 60,
    bash: true, // so timeout is enforced by ulimit
    command: "quarto",
    args,
    project_id,
    path: x.head,
    err_on_exit: false,
    aggregate: { value: hash },
  });
}
