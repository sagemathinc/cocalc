/*
Convert Mediawiki file to hidden HTML file, which gets displayed in an iframe with
src pointed to this file (via raw server).
*/
import { exec } from "../generic/client";
import { aux_file } from "../frame-tree/util";

export async function convert(
  project_id: string,
  path: string,
  time?: number
): Promise<void> {
  const outfile = aux_file(path, "html");
  await exec({
    command: "pandoc",
    args: [
      "--toc",
      "-f",
      "mediawiki",
      "-t",
      "html5",
      "--highlight-style",
      "pygments",
      path,
      "-o",
      outfile
    ],
    project_id: project_id,
    err_on_exit: true,
    aggregate: time
  });
}
