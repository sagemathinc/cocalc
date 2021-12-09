import { IconName } from "@cocalc/frontend/components/icon";

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
