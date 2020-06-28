/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Supplies the interface for creating file editors in the webapp

// I factored out the pure javascript code that doesn't require a bunch of very frontend-ish stuff
// here, but still want this file to provide these as exports, so I don't have to change code
// all over the place:
export {
  icon,
  register_file_editor,
  initialize,
  generate,
  remove,
  save,
} from "./file-editors";

import { file_associations } from "./file-associations";

const NO_EXT_PREFIX = "noext-";
export function special_filenames_with_no_extension(): string[] {
  const v: string[] = [];
  for (const name in file_associations) {
    if (name.startsWith(NO_EXT_PREFIX)) {
      v.push(name.slice(NO_EXT_PREFIX.length));
    }
  }
  return v;
}

import "./editors/register-all";
