/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Cost } from "./types";

export function percent_discount({
  cost_cents,
  discounted_cost_cents,
}: Pick<Cost, "cost_cents" | "discounted_cost_cents">): number {
  return Math.round(100 * (1 - discounted_cost_cents / cost_cents));
}

export function money(n: number, hideCurrency: boolean = false): string {
  let s = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);
  const i = s.indexOf(".");
  if (i == s.length - 2) {
    s += "0";
  }
  return (hideCurrency ? "" : "USD ") + s;
}
