/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { change_filename_extension, path_split } from "smc-util/misc";
import { join } from "path";

// something in the rmarkdown source code replaces all spaces by dashes
// [hsy] I think this is because of calling pandoc.
// I'm not aware of any other replacements.
// https://github.com/rstudio/rmarkdown
// problem: do not do this for the directory name, only the filename -- issue #4405
export function derive_rmd_output_filename(path, ext) {
  const { head, tail } = path_split(path);
  const fn = change_filename_extension(tail, ext).replace(/ /g, "-");
  // avoid a leading / if it's just a filename (i.e. head = '')
  return join(head, fn);
}
