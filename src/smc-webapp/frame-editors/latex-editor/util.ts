/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
data and functions specific to the latex editor.
*/

import { change_filename_extension } from "smc-util/misc2";

export function pdf_path(path: string): string {
  return change_filename_extension(path, "pdf");
}
