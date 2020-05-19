/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

declare var $: any;

export function is_safari(): boolean {
  return !!$.browser?.safari;
}

export function is_firefox(): boolean {
  return !!$.browser?.firefox;
}

export function is_chrome(): boolean {
  return !!$.browser?.chrome;
}
