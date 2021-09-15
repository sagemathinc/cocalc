import { capitalize, field_cmp } from "@cocalc/util/misc";
import { splitFirst, splitLast } from "@cocalc/util/misc-path";
import INVENTORY from "dist/inventory/compute-inventory.json";

export interface Item {
  name: string;
  path: string;
  output: string;
}

export default function executables() {
  const exes: Item[] = [];
  for (const path in INVENTORY.executables) {
    const name = capitalize(splitFirst(splitLast(path, "/")[1], "-")[0]);
    exes.push({ path, output: INVENTORY.executables[path], name });
  }

  exes.sort(field_cmp("name"));
  return exes;
}
