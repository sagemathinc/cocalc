import { to_money } from "@cocalc/util/misc";

export function currency(n: number, d?: number) {
  return `$${to_money(n ?? 0, d ?? (Math.abs(n) < 0.1 ? 3 : 2))}`;
}
