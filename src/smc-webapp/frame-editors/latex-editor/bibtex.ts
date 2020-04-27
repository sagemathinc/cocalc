/*
Run BibTex
*/

import { exec } from "../generic/client";
import { parse_path } from "../frame-tree/util";

// time (ms since epoch) to use for aggregate

export async function bibtex(
  project_id: string,
  path: string,
  time?: number,
  output_directory?: string
) {
  const { base, directory } = parse_path(path);
  return await exec({
    command: "bibtex",
    args: [base],
    project_id: project_id,
    path: output_directory || directory,
    err_on_exit: false,
    aggregate: time,
  });
}
