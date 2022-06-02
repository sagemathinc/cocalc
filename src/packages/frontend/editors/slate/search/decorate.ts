/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create decorate function for a given search string.
*/

import { Element, Node, Path, Point, Text } from "slate";

interface Match {
  anchor: Point;
  focus: Point;
  search: true;
}

export function createSearchDecorate(search): ([Node, Path]) => Match[] {
  search = search.trim().toLowerCase();
  if (!search) {
    // trivial function (as fast as possible)
    return () => [];
  }
  const hashtags = search[0] == "#";
  return ([node, path]: [Node, Path]) => {
    if (Text.isText(node)) {
      return searchText(node, path, search);
    }
    if (!Element.isElement(node)) return [];
    if (
      hashtags &&
      node.type == "hashtag" &&
      node.content.toLowerCase() == search.slice(1)
    ) {
      return [
        {
          search: true,
          anchor: { path, offset: 0 },
          focus: { path, offset: 0 },
        },
      ];
    }
    return [];
  };
}

// TODO: It would be nice to make this regular expression aware!

function searchText(node: Text, path: Path, search: string): Match[] {
  const matches: Match[] = [];

  const { text } = node;
  const parts = text.toLowerCase().split(search);
  let offset = 0;

  parts.forEach((part, i) => {
    if (i !== 0) {
      matches.push({
        anchor: { path, offset: offset - search.length },
        focus: { path, offset },
        search: true,
      });
    }

    offset = offset + part.length + search.length;
  });

  return matches;
}
