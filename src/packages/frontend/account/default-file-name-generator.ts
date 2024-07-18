/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Return a default filename with the given ext (or not extension if ext not given)
// this is just a wrapper for backwards compatibility
import { redux } from "@cocalc/frontend/app-framework";
import { DEFAULT_NEW_FILENAMES, NEW_FILENAMES } from "@cocalc/util/db-schema";
import { NewFilenames } from "../project/utils";

const new_filenames_generator = new NewFilenames(undefined, true);

export function default_filename(ext?: string, project_id?: string): string {
  const account_store = redux.getStore("account");
  const type =
    account_store?.getIn(["other_settings", NEW_FILENAMES]) ??
    DEFAULT_NEW_FILENAMES;
  new_filenames_generator.set_ext(ext);

  if (project_id != undefined) {
    const avoid = redux
      .getProjectActions(project_id)
      .get_filenames_in_current_dir();
    return new_filenames_generator.gen(type, avoid);
  } else {
    return new_filenames_generator.gen(type);
  }
}
