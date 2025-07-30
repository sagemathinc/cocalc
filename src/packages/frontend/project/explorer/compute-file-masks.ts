/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { derive_rmd_output_filename } from "@cocalc/frontend/frame-editors/rmd-editor/utils";
import { dict, filename_extension } from "@cocalc/util/misc";
import { DirectoryListing, DirectoryListingEntry } from "./types";

const MASKED_FILENAMES = new Set(["__pycache__"]);

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
export function computeFileMasks(listing: DirectoryListing): void {
  // map filename to file for easier lookup
  const filename_map: { [name: string]: DirectoryListingEntry } = dict(
    listing.map((item) => [item.name, item]),
  );
  for (const file of listing) {
    // mask certain known paths
    if (MASKED_FILENAMES.has(file.name as any)) {
      filename_map[file.name].mask = true;
    }

    // NOTE: never skip already masked files, because of rnw/rtex->tex

    const ext = filename_extension(file.name).toLowerCase();

    // some extensions like Rmd modify the basename during compilation
    const filename = deriveFilename(file.name, ext);

    const basename = filename.slice(0, filename.length - ext.length);

    for (let mask_ext of MASKED_FILE_EXTENSIONS[ext] ?? []) {
      // check each possible compiled extension
      let derivedBasename;
      // some uppercase-strings have special meaning
      if (mask_ext.startsWith("NODOT")) {
        derivedBasename = basename.slice(0, -1); // exclude the trailing dot
        mask_ext = mask_ext.slice("NODOT".length);
      } else if (mask_ext.includes("FILENAME")) {
        derivedBasename = mask_ext.replace("FILENAME", filename);
        mask_ext = "";
      } else if (mask_ext.includes("BASENAME")) {
        derivedBasename = mask_ext.replace("BASENAME", basename.slice(0, -1));
        mask_ext = "";
      } else if (mask_ext.includes("BASEDASHNAME")) {
        // BASEDASHNAME is like BASENAME, but replaces spaces by dashes
        // https://github.com/sagemathinc/cocalc/issues/3229
        const fragment = basename.slice(0, -1).replace(/ /g, "-");
        derivedBasename = mask_ext.replace("BASEDASHNAME", fragment);
        mask_ext = "";
      } else {
        derivedBasename = basename;
      }
      const maskFilename = `${derivedBasename}${mask_ext}`;
      if (filename_map[maskFilename] != null) {
        filename_map[maskFilename].mask = true;
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
