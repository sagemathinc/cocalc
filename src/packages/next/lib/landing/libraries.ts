import INVENTORY from "dist/inventory/compute-inventory.json";
import COMPONENTS from "dist/inventory/compute-components.json";
import { field_cmp, trunc } from "@cocalc/util/misc";

const SPEC = {
  python: {
    python3: "/usr/bin/python3",
    python2: "/usr/bin/python2",
    sage: "sage -python",
    anaconda: "/ext/anaconda2020.02/bin/python",
  },
  R: {
    r: "/usr/bin/R",
    sage_r: "sage -R",
  },
  octave: {
    octave: "/usr/local/bin/octave",
  },
  julia: {
    julia: "/ext/bin/julia",
  },
};

export interface Item {
  name: string;
  key: string;
  url?: string;
  summary?: string;
  search: string;

  python3?: string;
  sage?: string;
  anaconda?: string;
  python2?: string;

  r?: string;
  sage_r?: string;

  octave?: string;

  julia?: string;
}

export type ProgramName = keyof typeof SPEC;

export default function libraries(
  prog: ProgramName,
  maxWidth: number = 30
): Item[] {
  const cmd = SPEC[prog];
  const inventory = INVENTORY[prog];
  const components = COMPONENTS[prog];

  const libs: Item[] = [];
  let index = 0;
  for (const name in components) {
    const { url, summary } = components[name] ?? {};
    const item = {
      index: libs.length,
      name,
      key: name.toLowerCase(),
      summary,
      url: url?.split(",")[0], // there may be multiple url's separated by commas in some cases
      search: (name + (summary ?? "")).toLowerCase(),
    };
    for (const env in cmd) {
      item[env] = trunc(inventory[cmd[env]][name], maxWidth);
    }
    libs.push(item);
  }

  libs.sort(field_cmp("key"));
  return libs;
}
