import { Element } from "../types";
import { field_cmp } from "@cocalc/util/misc";

// the old page format
function parseSyncdbFilePageNumbers(content: string): Element[][] {
  const pages: Element[][] = [];
  let maxPage = 1;
  for (const line of content.split("\n")) {
    try {
      const element = JSON.parse(line);
      const page = element.page ?? 1;
      if (pages[page - 1] == null) {
        pages[page - 1] = [element];
      } else {
        pages[page - 1].push(element);
      }
      maxPage = Math.max(maxPage, page);
    } catch (_err) {
      console.warn(`skipping invalid .board content -- "${line}"`);
    }
  }
  for (let i = 0; i < maxPage; i++) {
    if (pages[i] == null) {
      pages[i] = [];
    }
  }
  return pages;
}

// the new page format.
function parseSyncdbFilePageIds(content: string): Element[][] {
  const v: { pos: number; id: string }[] = [];
  const pageMap: { [id: string]: Element[] } = {};
  for (const line of content.split("\n")) {
    try {
      const element = JSON.parse(line);
      if (element.type == "page") {
        v.push({ pos: element.data.pos, id: element.id });
        if (pageMap[element.id] == null) {
          pageMap[element.id] = [];
        }
      } else {
        if (pageMap[element.page] == null) {
          pageMap[element.page] = [];
        }
        pageMap[element.page].push(element);
      }
    } catch (_err) {
      console.warn(`skipping invalid .board content -- "${line}"`);
    }
  }
  v.sort(field_cmp("pos"));
  const pages: Element[][] = [];
  for (const { id } of v) {
    pages.push(pageMap[id]);
  }
  return pages;
}

function isOldPageFormat(content: string): boolean {
  const i = content.indexOf("\n");
  if (i == -1) return false;
  const line0 = content.slice(0, i);
  try {
    return typeof JSON.parse(line0).page == "number";
  } catch (err) {
    return false;
  }
}

export function parseSyncdbFile(content: string): Element[][] {
  if (isOldPageFormat(content)) {
    return parseSyncdbFilePageNumbers(content);
  } else {
    return parseSyncdbFilePageIds(content);
  }
}
