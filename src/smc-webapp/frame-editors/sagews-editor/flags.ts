/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// see smc-util/sagews.coffee for all of the things to implement here.

export function input_is_hidden(flags: string | undefined): boolean {
  return flags != null && flags.indexOf("i") != -1;
}

export function output_is_hidden(flags: string | undefined): boolean {
  return flags != null && flags.indexOf("o") != -1;
}
