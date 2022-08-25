import { ElementsMap, Element } from "./types";
import { search_match, search_split } from "@cocalc/util/misc";

export default function sortedElements(
  elementsMap : ElementsMap,
  search: string = ""
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

  v?.sort((elt1, elt2) => {
    if ((elt1.page ?? 1) < (elt2.page ?? 1)) return -1;
    if ((elt1.page ?? 1) > (elt2.page ?? 1)) return 1;
    if (elt1.y < elt2.y) return -1;
    if (elt1.y > elt2.y) return 1;
    if (elt1.x <= elt2.x) return -1;
    return 1;
  });
  return v;
}
