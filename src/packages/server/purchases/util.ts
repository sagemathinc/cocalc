import { to_money } from "@cocalc/util/misc";

export function currency(n) {
  return `$${to_money(n)}`;
}
