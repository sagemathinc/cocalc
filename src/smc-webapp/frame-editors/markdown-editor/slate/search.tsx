/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Support for full text search of our slate.js document.

Inspired by https://www.slatejs.org/examples/search-highlighting


*/

import { debounce } from "lodash";

import { Input } from "antd";

import * as React from "react";
const { useMemo, useState } = React;
import { Point, Text } from "slate";

const DEFAULT_DEBOUNCE_MS = 500; // 500ms is pretty safe -- slate is pretty slow and handling this.

interface Options {
  debounce: number; // time in ms.
}

export const useSearch = (options?: Options) => {
  const [search, setSearch] = useState<string>("");

  const decorate = useMemo(() => {
    const lowercaseSearch = search.trim().toLowerCase();
    if (!lowercaseSearch) {
      // trivial function (as fast as possible)
      return () => [];
    }
    return ([node, path]) => {
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
  }, [search]);

  const Search = useMemo(
    () => (
      <Input.Search
        allowClear={true}
        size="small"
        placeholder="Search..."
        defaultValue={search}
        onChange={debounce(
          (e) => setSearch(e.target.value),
          options?.debounce ?? DEFAULT_DEBOUNCE_MS
        )}
        onSearch={(value) => setSearch(value)}
        style={{
          border: 0,
          paddingLeft: "1ex",
          width: "30ex",
          maxWidth: "100%",
        }}
      />
    ),
    [search]
  );

  return { decorate, Search, search };
};
