/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export function money(n: number, hideCurrency: boolean = false): string {
  let s;
  if (n == 0) {
    s = "0";
  } else {
    s = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(n);
    const i = s.indexOf(".");
    if (i == -1) {
      s += ".00";
    } else if (i == s.length - 2) {
      s += "0";
    }
  }
  return (hideCurrency ? "" : "USD ") + s;
}
