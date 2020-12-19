/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as misc from "smc-util/misc";
import { file_associations } from "./file-associations";
import { icon as file_icon } from "./file-editors";

// Given a text file (defined by content), try to guess
// what the extension should be.
function guess_file_extension_type(content: string): string {
  content = $.trim(content);
  const i = content.indexOf("\n");
  const first_line = content.slice(0, i).toLowerCase();
  if (first_line.slice(0, 2) === "#!") {
    // A script.  What kind?
    if (first_line.indexOf("python") !== -1) {
      return "py";
    }
    if (first_line.indexOf("bash") !== -1 || first_line.indexOf("sh") !== -1) {
      return "sh";
    }
    if (first_line.indexOf("node") !== -1) {
      return "js";
    }
  }
  if (first_line.indexOf("html") !== -1) {
    return "html";
  }
  if (first_line.indexOf("/*") !== -1 || first_line.indexOf("//") !== -1) {
    // kind of a stretch
    return "c++";
  }
  return "";
}

export function file_options(filename: string, content?: string) {
  let x;
  let ext = misc.filename_extension_notilde(filename).toLowerCase();
  if (ext == "" && content != null) {
    // no recognized extension, but have contents
    ext = guess_file_extension_type(content);
  }
  if (ext == "") {
    x =
      file_associations[
        `noext-${misc.path_split(filename).tail.toLowerCase()}`
      ];
  } else {
    x = file_associations[ext];
  }
  if (x == null) {
    x = file_associations[""];
    // Don't use the icon for this fallback, to give the icon selection below a chance to work;
    // we do this so new react editors work.  All this code will go away someday.
    delete x.icon;
  }
  if (x.icon == null) {
    // Use the new react editor icons first, if they exist...
    const icon = file_icon(ext);
    if (icon != null) {
      x.icon = "fa-" + icon;
    } else {
      x.icon = "fa-question-circle";
    }
  }
  return x;
}
