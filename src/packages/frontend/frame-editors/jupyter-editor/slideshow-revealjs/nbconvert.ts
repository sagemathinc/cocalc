/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { path_split, separate_file_extension } from "@cocalc/util/misc";
import { exec } from "../../generic/client";
import { fileURL } from "@cocalc/frontend/lib/cocalc-urls";
import { sanitize_nbconvert_path } from "@cocalc/util/sanitize-nbconvert";

export async function revealjs_slideshow_html(
  project_id: string,
  path: string,
  compute_server_id?: number,
): Promise<string> {
  const split = path_split(path);
  // The _ bewlo is because of https://github.com/sagemathinc/cocalc/issues/4066, i.e., otherwise
  // things don't work if path is a number.
  const base = "._" + separate_file_extension(split.tail).name;
  const command = "/usr/local/bin/jupyter";
  const args = [
    "nbconvert",
    "--to",
    "slides",
    sanitize_nbconvert_path(path),
    "--output",
    base,
  ];
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
  return fileURL({ project_id, path: html_filename, compute_server_id });
}
