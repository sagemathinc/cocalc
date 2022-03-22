import { capitalize, field_cmp } from "@cocalc/util/misc";
import { splitFirst, splitLast } from "@cocalc/util/misc-path";

export interface Item {
  name: string;
  path: string;
  output: string;
}

export default function executables(softwareSpec): Item[] {
  const exes: Item[] = [];
  for (const path in softwareSpec) {
    const name = capitalize(splitFirst(splitLast(path, "/")[1], "-")[0]);
    exes.push({
      path,
      output: softwareSpec[path],
      name,
    });
  }

  exes.sort(field_cmp("name"));
  return exes;
}
