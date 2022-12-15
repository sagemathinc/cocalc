import { capitalize, replace_all } from "@cocalc/util/misc";

export function fieldToLabel(field: string): string {
  return capitalize(replace_all(field, "_", " "));
}

export function toNumber(s: string | number | undefined | null): number {
  if (s == null) return 0;
  if (typeof s == "number") return s;
  const n = parseFloat(s);
  if (isFinite(n)) return n;
  return 0;
}
