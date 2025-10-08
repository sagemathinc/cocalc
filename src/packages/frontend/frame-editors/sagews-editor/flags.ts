/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export const MARKERS = { cell: "\uFE20", output: "\uFE21" };

export function inputIsHidden(flags: string | undefined): boolean {
  return flags != null && flags.indexOf("i") != -1;
}

export function outputIsHidden(flags: string | undefined): boolean {
  return flags != null && flags.indexOf("o") != -1;
}
