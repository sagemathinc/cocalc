import { capitalize, replace_all } from "@cocalc/util/misc";

export function fieldToLabel(field: string): string {
  return capitalize(replace_all(field, "_", " "));
}
