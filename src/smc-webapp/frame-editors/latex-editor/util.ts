/*
data and functions specific to the latex editor.
*/

import { change_filename_extension } from "smc-util/misc2";

export function pdf_path(path: string): string {
  return change_filename_extension(path, "pdf");
}
