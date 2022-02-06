/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as misc from "@cocalc/util/misc";
import { derive_rmd_output_filename } from "@cocalc/frontend/frame-editors/rmd-editor/utils";
import {
  MASKED_FILENAMES,
  MASKED_FILE_EXTENSIONS,
} from "@cocalc/frontend/project_store";

// listing is already .toJS()
export default function compute_file_masks(listing): void {
  // mask compiled files, e.g. mask 'foo.class' when 'foo.java' exists
  // the general outcome of this function is to set for some file entry objects
  // in "listing" the attribute <file>.mask=true
  const filename_map = misc.dict(listing.map((item) => [item.name, item])); // map filename to file
  for (const file of listing) {
    // mask certain known directories
    if (MASKED_FILENAMES.indexOf(file.name) >= 0) {
      filename_map[file.name].mask = true;
    }

    // note: never skip already masked files, because of rnw/rtex->tex
    const ext = misc.filename_extension(file.name).toLowerCase();
    // some extensions like Rmd modify the basename during compilation
    const filename = (function () {
      switch (ext) {
        case "rmd":
          // converts .rmd to .rmd, but the basename changes!
          return derive_rmd_output_filename(file.name, "rmd");
        default:
          return file.name;
      }
    })();

    const basename = filename.slice(0, filename.length - ext.length);

    for (let mask_ext of MASKED_FILE_EXTENSIONS[ext] ?? []) {
      // check each possible compiled extension
      let bn; // derived basename

      // some uppercase-strings have special meaning
      if (misc.startswith(mask_ext, "NODOT")) {
        bn = basename.slice(0, -1); // exclude the trailing dot
        mask_ext = mask_ext.slice("NODOT".length);
      } else if (mask_ext.indexOf("FILENAME") >= 0) {
        bn = mask_ext.replace("FILENAME", filename);
        mask_ext = "";
      } else if (mask_ext.indexOf("BASENAME") >= 0) {
        bn = mask_ext.replace("BASENAME", basename.slice(0, -1));
        mask_ext = "";
      } else if (mask_ext.indexOf("BASEDASHNAME") >= 0) {
        // BASEDASHNAME is like BASENAME, but replaces spaces by dashes
        // https://github.com/sagemathinc/cocalc/issues/3229
        const fragment = basename.slice(0, -1).replace(/ /g, "-");
        bn = mask_ext.replace("BASEDASHNAME", fragment);
        mask_ext = "";
      } else {
        bn = basename;
      }
      const mask_fn = `${bn}${mask_ext}`;
      if (filename_map[mask_fn] != null) {
        filename_map[mask_fn].mask = true;
      }
    }
  }
}
