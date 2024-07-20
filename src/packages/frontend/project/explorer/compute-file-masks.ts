/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { derive_rmd_output_filename } from "@cocalc/frontend/frame-editors/rmd-editor/utils";
import { dict, filename_extension, startswith } from "@cocalc/util/misc";
import { DirectoryListing, DirectoryListingEntry } from "./types";

const MASKED_FILENAMES = ["__pycache__"] as const;

const MASKED_FILE_EXTENSIONS = {
  py: ["pyc"],
  java: ["class"],
  cs: ["exe"],
  tex: [
    "aux",
    "bbl",
    "blg",
    "fdb_latexmk",
    "fls",
    "glo",
    "idx",
    "ilg",
    "ind",
    "lof",
    "log",
    "nav",
    "out",
    "pgf-plot.gnuplot",
    "pgf-plot.table",
    "pythontex-files-BASEDASHNAME",
    "pytxcode",
    "sage-plots-for-FILENAME",
    "sagetex.sage",
    "sagetex.sage.py",
    "sagetex.scmd",
    "sagetex.sout",
    "snm",
    "synctex.gz",
    "synctex.gz(busy)",
    "toc",
    "vrb", // https://github.com/sagemathinc/cocalc/issues/6977
    "xyc",
  ],
  rnw: ["tex", "NODOT-concordance.tex"],
  rtex: ["tex", "NODOT-concordance.tex"],
  rmd: ["pdf", "html", "nb.html", "md", "NODOT_files", "NODOT_cache"],
  qmd: ["pdf", "html", "NODOT_files"],
  sage: ["sage.py"],
} as const;

/** mask compiled files, e.g. mask 'foo.class' when 'foo.java' exists
 * the general outcome of this function is to set for some file entry objects
 * in "listing" the attribute <file>.mask=true
 */
export function compute_file_masks(listing: DirectoryListing): void {
  // map filename to file for easier lookup
  const filename_map: { [name: string]: DirectoryListingEntry } = dict(
    listing.map((item) => [item.name, item]),
  );
  for (const file of listing) {
    // mask certain known directories
    if (MASKED_FILENAMES.indexOf(file.name as any) >= 0) {
      filename_map[file.name].mask = true;
    }

    // note: never skip already masked files, because of rnw/rtex->tex
    const ext = filename_extension(file.name).toLowerCase();

    // some extensions like Rmd modify the basename during compilation
    const filename = deriveFilename(file.name, ext);

    const basename = filename.slice(0, filename.length - ext.length);

    for (let mask_ext of MASKED_FILE_EXTENSIONS[ext] ?? []) {
      // check each possible compiled extension
      let bn; // derived basename
      // some uppercase-strings have special meaning
      if (startswith(mask_ext, "NODOT")) {
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

function deriveFilename(name, ext) {
  switch (ext) {
    case "rmd":
      // converts .rmd to .rmd, but the basename changes!
      return derive_rmd_output_filename(name, "rmd");
    default:
      return name;
  }
}
