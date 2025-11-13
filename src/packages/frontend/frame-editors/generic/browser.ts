/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import $ from "jquery";

export function is_safari(): boolean {
  // @ts-ignore
  return !!$.browser?.safari;
}

export function is_firefox(): boolean {
  // @ts-ignore
  return !!$.browser?.firefox;
}

export function is_chrome(): boolean {
  // @ts-ignore
  return !!$.browser?.chrome;
}
