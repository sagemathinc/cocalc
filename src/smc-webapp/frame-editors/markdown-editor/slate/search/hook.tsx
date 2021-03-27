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

import { SearchControlButtons } from "./search-control";

const DEFAULT_DEBOUNCE_MS = 300;

interface Options {
  debounce: number; // time in ms.
}

export interface SearchHook {
  decorate: ([node, path]) => { anchor: Point; focus: Point; search: true }[];
  Search: JSX.Element;
  search: string;
}

export const useSearch: (Options?) => SearchHook = (options?) => {
  const [search, setSearch] = useState<string>("");
  const [index, setIndex] = useState<number>(0);

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
      <Input
        allowClear={true}
        size="small"
        placeholder="Search..."
        defaultValue={search}
        onChange={debounce(
          (e) => setSearch(e.target.value),
          options?.debounce ?? DEFAULT_DEBOUNCE_MS
        )}
        style={{
          border: 0,
          paddingLeft: "1ex",
          width: "100%",
        }}
        addonAfter={
          <SearchControlButtons
            index={index}
            matches={Math.max(0, search.length - 2)}
            setIndex={setIndex}
          />
        }
      />
    ),
    [search, index]
  );

  return { decorate, Search, search };
};
