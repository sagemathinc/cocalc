import { IconName } from "@cocalc/frontend/components/icon";
import { search_split, search_match } from "@cocalc/util/misc";

interface Info0 {
  path: string;
  desc: string;
  title: string;
  icon?: IconName;
}

export interface Info extends Info0 {
  search: string;
}

interface Info1 extends Info0 {
  search?: string | object;
}

const searchInfo: { [path: string]: Info } = {};

export function register(info: Info1) {
  const search = (
    info.desc +
    " " +
    info.path +
    " " +
    info.title +
    " " +
    JSON.stringify(info.search ?? "")
  ).toLowerCase();
  searchInfo[info.path] = { ...info, search };
}

export function search(s: string, allowEmpty?: boolean): Info[] {
  const v = search_split(s.toLowerCase().trim());
  const result: Info[] = [];
  if (v.length == 0 && !allowEmpty) return result;
  for (const path in searchInfo) {
    if (
      v.length == 0 ||
      (searchInfo[path].search && search_match(searchInfo[path].search, v))
    ) {
      result.push(searchInfo[path]);
    }
  }
  return result;
}
