import { to_money } from "@cocalc/util/misc";

export function currency(n, d = 2) {
  return `$${to_money(n ?? 0, d)}`;
}
