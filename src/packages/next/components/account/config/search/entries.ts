import { IconName } from "@cocalc/frontend/components/icon";

export interface Info {
  path: string;
  desc: string;
  title: string;
  icon: IconName;
  search?: string;
}

const searchInfo: { [path: string]: Info } = {};

export function register(info: Info) {
  const search = (
    info.desc +
    " " +
    info.path +
    " " +
    info.title +
    " " +
    (info.search ?? "")
  ).toLowerCase();
  searchInfo[info.path] = { ...info, search };
}

export function search(s: string): Info[] {
  s = s.toLowerCase().trim();
  if (!s) return [];
  const result: Info[] = [];
  for (const path in searchInfo) {
    if (matches(s, searchInfo[path].search ?? "")) {
      result.push(searchInfo[path]);
    }
  }
  return result;
}

function matches(s, search: string): boolean {
  return search.includes(s);
}
