import { Element } from "../types";

export function parseSyncdbFile(content: string): Element[][] {
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
