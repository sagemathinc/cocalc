import { parseTableOfContents as parseMarkdownTOC } from "@cocalc/frontend/markdown";
import { TableOfContentsEntry as Entry } from "@cocalc/frontend/components";
import { ElementsMap } from "./types";
import sortedElements from "./sorted-elements";

export default function parseTableOfContents(
  elementsMap: ElementsMap
): Entry[] {
  const entries: Entry[] = [];
  const state: any = {};
  for (const element of sortedElements(elementsMap)) {
    if (element.str) {
      for (const entry of parseMarkdownTOC(element.str, state)) {
        entry.id = element.id;
        entries.push(entry);
      }
    }
  }
  return entries;
}
