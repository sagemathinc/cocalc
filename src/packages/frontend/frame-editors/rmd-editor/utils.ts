/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { change_filename_extension, path_split } from "@cocalc/util/misc";
import { join } from "path";
import { Set } from "immutable";

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

export async function checkProducedFiles(codeEditorActions) {
  const project_actions = codeEditorActions.redux.getProjectActions(
    codeEditorActions.project_id,
  );
  if (project_actions == null) {
    return;
  }

  let existing = Set();
  const fs = codeEditorActions.fs();
  const f = async (ext: string) => {
    const expectedFilename = derive_rmd_output_filename(
      codeEditorActions.path,
      ext,
    );
    if (await fs.exists(expectedFilename)) {
      existing = existing.add(ext);
    }
  };
  const v = ["pdf", "html", "nb.html"].map(f);
  await Promise.all(v);

  // console.log("setting derived_file_types to", existing.toJS());
  codeEditorActions.setState({
    derived_file_types: existing as any,
  });
}
