import { change_filename_extension } from "smc-util/misc2";

// something in the rmarkdown source code replaces all spaces by dashes
// [hsy] I think this is because of calling pandoc.
// I'm not aware of any other replacements.
// https://github.com/rstudio/rmarkdown
export function derive_rmd_output_filename(path, ext) {
  return change_filename_extension(path, ext).replace(/ /g, "-");
}
