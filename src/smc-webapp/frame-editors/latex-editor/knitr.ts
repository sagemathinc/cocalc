/*
Run Rweave on rnw files
*/

import { exec, ExecOutput } from "../generic/client";
import { parse_path } from "../frame-tree/util";

export async function knitr(
  project_id: string,
  path: string, // pass in this.filename_rnw
  time: number,
  status: Function
): Promise<ExecOutput> {
  const { directory, filename } = parse_path(path);
  const cmd: string = `echo 'require(knitr); opts_knit$set(concordance = TRUE); knit("${filename}")' | R --no-save`;
  status(`running ${cmd}`);
  return exec({
    allow_post: false, // definitely could take a long time to fully run Rweave
    timeout: 360,
    command: cmd,
    bash: true,
    project_id: project_id,
    path: directory,
    err_on_exit: false,
    aggregate: { value: time } // one might think to aggregate on hash, but the output could be random!
  });
}
