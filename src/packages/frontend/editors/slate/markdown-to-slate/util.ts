import { load } from "cheerio";

export function getAttrs(content: string, attrs: string[]): [string, string][] {
  const x = load("")(content);
  const v: [string, string][] = [];
  for (const attr of attrs) {
    const val = x.attr(attr);
    if (val != null) {
      v.push([attr, val]);
    }
  }
  return v;
}
