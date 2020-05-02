/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { path_split, separate_file_extension } from "smc-util/misc2";
import { exec, raw_url_of_file } from "../../generic/client";

export async function revealjs_slideshow_html(
  project_id: string,
  path: string
): Promise<string> {
  const split = path_split(path);
  // The _ bewlo is because of https://github.com/sagemathinc/cocalc/issues/4066, i.e., otherwise
  // things don't work if path is a number.
  const base = "._" + separate_file_extension(split.tail).name;
  const command = "/usr/local/bin/jupyter";
  const args = ["nbconvert", "--to", "slides", path, "--output", base];
  const opts = {
    command,
    args,
    project_id,
  };
  await exec(opts);
  const ext = ".slides.html";
  const html_filename = split.head
    ? [split.head, base + ext].join("/")
    : base + ext;
  return raw_url_of_file(project_id, html_filename);
}
