/*
data and functions specific to the latex editor.
*/

import { change_filename_extension } from "../generic/misc";

export function pdf_path(path: string): string {
  return change_filename_extension(path, "pdf");
}

export const KNITR_EXTS: ReadonlyArray<string> = ["rnw", "rtex"];