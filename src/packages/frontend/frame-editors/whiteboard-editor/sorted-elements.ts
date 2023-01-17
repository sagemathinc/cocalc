import { ElementsMap, Element, SortedPageList } from "./types";
import { search_match, search_split } from "@cocalc/util/misc";

export default function sortedElements(
  elementsMap: ElementsMap,
  sortedPageIds?: SortedPageList,
  search?: string
): Element[] {
  // We only include elements with a str attribute for now,
  // e.g., notes, code, text.  If change to use more, need
  // to filter type to note be "edge".
  let v = elementsMap
    .valueSeq()
    .filter((x) => x != null && x.get("str"))
    .toJS();

  if (search) {
    // filter by matches for the str attribute for now.
    const s = search_split(search);
    v = v.filter((x) => x.str && search_match(x.str.toLowerCase(), s));
  }

  const idToNumber: { [id: string]: number } = {};
  if (sortedPageIds != null) {
    let n = 1;
    for (const id of sortedPageIds) {
      idToNumber[id] = n;
      n += 1;
    }
  }

  v?.sort((elt1, elt2) => {
    if ((idToNumber[elt1.page] ?? 1) < (idToNumber[elt2.page] ?? 1)) {
      return -1;
    }
    if ((idToNumber[elt1.page] ?? 1) > (idToNumber[elt2.page] ?? 1)) {
      return 1;
    }
    if (elt1.y < elt2.y) return -1;
    if (elt1.y > elt2.y) return 1;
    if (elt1.x <= elt2.x) return -1;
    return 1;
  });
  return v;
}
