import type { Element } from "../types";
import { field_cmp } from "@cocalc/util/misc";

// the old page format
export function parseSyncdbFileUsingPageNumbers(content: string): Element[][] {
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
function parseSyncdbFileUsingPageIds(
  content: string,
  fixedElements: Element[]
): Element[][] {
  const v: { pos: number; id: string }[] = [];
  const pageMap: { [id: string]: Element[] } = {};
  for (const line of content.split("\n")) {
    try {
      const element = JSON.parse(line);
      if (element.type == "page") {
        v.push({ pos: element.data.pos, id: element.id });
        if (pageMap[element.id] == null) {
          pageMap[element.id] = [...fixedElements];
        }
      } else {
        if (pageMap[element.page] == null) {
          pageMap[element.page] = [...fixedElements];
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

export function parseSyncdbFile(
  content: string,
  fixedElements: Element[] = []
): Element[][] {
  if (isOldPageFormat(content)) {
    return parseSyncdbFileUsingPageNumbers(content);
  } else {
    return parseSyncdbFileUsingPageIds(content, fixedElements);
  }
}
