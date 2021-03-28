/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create decorate function for a given search string.
*/

import { Node, Path, Point, Text } from "slate";

export function createSearchDecorate(
  search
): ([Node, Path]) => { anchor: Point; focus: Point; search: true }[] {
  const lowercaseSearch = search.trim().toLowerCase();
  if (!lowercaseSearch) {
    // trivial function (as fast as possible)
    return () => [];
  }
  return ([node, path]: [Node, Path]) => {
    const ranges: { anchor: Point; focus: Point; search: true }[] = [];
    if (!Text.isText(node)) return ranges;

    const { text } = node;
    const parts = text.toLowerCase().split(lowercaseSearch);
    let offset = 0;

    parts.forEach((part, i) => {
      if (i !== 0) {
        ranges.push({
          anchor: { path, offset: offset - lowercaseSearch.length },
          focus: { path, offset },
          search: true,
        });
      }

      offset = offset + part.length + lowercaseSearch.length;
    });

    return ranges;
  };
}
