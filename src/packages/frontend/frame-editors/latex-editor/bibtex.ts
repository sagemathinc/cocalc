/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Run BibTex
*/

import { parse_path } from "@cocalc/frontend/frame-editors/frame-tree/util";
import { exec } from "@cocalc/frontend/frame-editors/generic/client";

// time (ms since epoch) to use for aggregate

export async function bibtex(
  project_id: string,
  path: string,
  time?: number,
  output_directory?: string,
) {
  const { base, directory } = parse_path(path);
  return await exec(
    {
      command: "bibtex",
      args: [base],
      project_id: project_id,
      path: output_directory || directory,
      err_on_exit: false,
      aggregate: time,
    },
    path,
  );
}
