/*
Run sagetex

- TODO: this might be better done always as part of latexmk; not sure.
*/

import { exec } from "../generic/client";
import { parse_path } from "../frame-tree/util";

export async function sagetex(project_id: string, path: string, time?: number) {
  let { base, directory } = parse_path(path); // base, directory, filename
  return exec({
    allow_post: false, // definitely could take a long time to fully run sage
    timeout: 360,
    command: "sage",
    args: [base + ".sagetex.sage"],
    project_id: project_id,
    path: directory,
    err_on_exit: false,
    aggregate: time
  });
}
