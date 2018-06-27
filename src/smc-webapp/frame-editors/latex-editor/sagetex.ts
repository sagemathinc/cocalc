/*
Run sagetex

- TODO: this might be better done always as part of latexmk; not sure.
*/

import { exec, ExecOutput } from "../generic/client";
import { parse_path } from "../frame-tree/util";

function sagetex_file(base: string): string {
  return base + ".sagetex.sage";
}

export async function sagetex_hash(
  project_id: string,
  path: string,
  time: number,
  status: Function
): Promise<string> {
  const { base, directory } = parse_path(path); // base, directory, filename
  const s = sagetex_file(base);
  status(`sha1sum ${s}`);
  const output = await exec({
    allow_post: true, // very quick computation of sha1 hash
    timeout: 10,
    command: "sha1sum",
    args: [s],
    project_id: project_id,
    path: directory,
    err_on_exit: true,
    aggregate: time
  });
  return output.stdout.split(" ")[0];
}

export async function sagetex(
  project_id: string,
  path: string,
  hash: string,
  status: Function
): Promise<ExecOutput> {
  const { base, directory } = parse_path(path); // base, directory, filename
  const s = sagetex_file(base);
  status(`sage ${s}`);
  return exec({
    allow_post: false, // definitely could take a long time to fully run sage
    timeout: 360,
    command: "sage",
    args: [s],
    project_id: project_id,
    path: directory,
    err_on_exit: false,
    aggregate: { value: hash } // thought by hsy: but what if the computation has randomized aspects?
  });
}
