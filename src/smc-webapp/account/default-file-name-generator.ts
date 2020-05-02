/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Return a default filename with the given ext (or not extension if ext not given)
// this is just a wrapper for backwards compatibility
import { NewFilenames, NewFilenameTypes } from "../project/utils";
import { NEW_FILENAMES } from "smc-util/db-schema";

import { redux } from "../app-framework";

const new_filenames_generator = new NewFilenames(undefined, true);

export const default_filename = function (
  ext?: string,
  project_id?: string
): string {
  const account_store = redux.getStore("account");
  const type: any = account_store // [j3] I have absolutely no idea why this won't type properly.
    ? account_store.getIn(["other_settings", NEW_FILENAMES])
    : (NewFilenames.default_family as NewFilenameTypes);
  new_filenames_generator.set_ext(ext);

  if (project_id != undefined) {
    const avoid = redux
      .getProjectActions(project_id)
      .get_filenames_in_current_dir();
    return new_filenames_generator.gen(type, avoid);
  } else {
    return new_filenames_generator.gen(type);
  }
};
