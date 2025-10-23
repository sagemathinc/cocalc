/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { filename_extension_notilde, path_split } from "@cocalc/util/misc";
import { file_associations } from "./file-associations";
import { icon as file_icon } from "./file-editors";

export function file_icon_class(ext: string) {
  const assoc = file_options("x." + ext);
  return assoc.icon;
}

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
  let ext = filename_extension_notilde(filename).toLowerCase();
  if (ext == "" && content != null) {
    // no recognized extension, but have contents
    ext = guess_file_extension_type(content);
  }
  if (ext == "") {
    x = file_associations[`noext-${path_split(filename).tail.toLowerCase()}`];
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
    const icon = file_icon(ext);
    if (icon != null) {
      x.icon = icon;
    } else {
      x.icon = UNKNOWN_FILE_TYPE_ICON;
    }
  }
  return x;
}

export const UNKNOWN_FILE_TYPE_ICON = "question-circle";
