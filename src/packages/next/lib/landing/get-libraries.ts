import { field_cmp } from "@cocalc/util/misc";
import {
  ComputeComponents,
  ComputeInventory,
  Item,
  LanguageName,
  SoftwareSpec,
} from "./types";

// client side processing, used to generate the data for the Antd tables
export function getLibaries(
  spec: SoftwareSpec[LanguageName],
  inventory: ComputeInventory[LanguageName],
  components: ComputeComponents[LanguageName]
): Item[] {
  const libs: Item[] = [];
  for (const name in components) {
    const { url, summary } = components[name] ?? {};
    const item: Item = {
      index: libs.length,
      name,
      key: name.toLowerCase(),
      summary: summary ?? "",
      // there may be multiple url's separated by commas in some cases
      // TODO show all URLs
      url: url?.split(",")[0],
      search: (name + (summary ?? "")).toLowerCase(),
    };
    for (const env in spec) {
      const envInfo = inventory[spec[env].cmd]?.[name];
      if (envInfo != null) item[env] = envInfo;
    }
    libs.push(item);
  }
  libs.sort(field_cmp("key"));
  return libs;
}
