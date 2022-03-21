import INVENTORY from "dist/inventory/compute-inventory.json";
import COMPONENTS from "dist/inventory/compute-components.json";
import { field_cmp } from "@cocalc/util/misc";
import { basename } from "path";

export type LanguageName = "python" | "R" | "octave" | "julia";

type SoftwareSpec = {
  [lang in LanguageName]: {
    [name: string]: { cmd: string; name: string; doc: string; url: string };
  };
};

// cached instance
let SPEC: Readonly<SoftwareSpec>;

export function getSpec() {
  if (SPEC != null) return SPEC;
  const nextSpec: Partial<SoftwareSpec> = {};
  for (const [cmd, info] of Object.entries(INVENTORY.language_exes)) {
    if (nextSpec[info.lang] == null) {
      nextSpec[info.lang] = {};
    }
    // the basename of the cmd path
    const base = cmd.indexOf(" ") > 0 ? cmd : basename(cmd);
    nextSpec[info.lang][base] = {
      cmd,
      name: info.name,
      doc: info.doc,
      url: info.url,
    };
  }
  SPEC = nextSpec as SoftwareSpec;
  return SPEC;
}

export interface Item {
  name: string;
  key: string;
  url?: string;
  summary?: string;
  search: string;

  // NOTE: the keys below are just examples.
  // Use what's stored for each language in the SPEC mapping
  python3?: string;
  sage?: string;
  anaconda?: string;
  python2?: string;

  R?: string;
  "sage -R"?: string;

  octave?: string;

  julia?: string;
}

export default function libraries(lang: LanguageName): Item[] {
  const cmd = getSpec()[lang];
  const inventory = INVENTORY[lang];
  const components = COMPONENTS[lang];

  const libs: Item[] = [];
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
      item[env] = inventory[cmd[env].cmd][name];
    }
    libs.push(item);
  }

  libs.sort(field_cmp("key"));
  return libs;
}
