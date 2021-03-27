/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Support for global full text search of our slate.js document.
*/

import { Input } from "antd";
import * as React from "react";
const { useMemo, useRef, useState } = React;
import { Editor, Point, Range, Text, Transforms } from "slate";
import {
  nextMatch,
  previousMatch,
  SearchControlButtons,
} from "./search-control";
import { ReactEditor } from "../slate-react";

interface Options {
  editor: Editor;
}

export interface SearchHook {
  decorate: ([node, path]) => { anchor: Point; focus: Point; search: true }[];
  Search: JSX.Element;
  search: string;
  previous: () => void;
  next: () => void;
  focus: (search?: string) => void;
}

export const useSearch: (Options) => SearchHook = (options) => {
  const { editor } = options;
  const [search, setSearch] = useState<string>("");
  const inputRef = useRef<any>(null);

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
        ref={inputRef}
        allowClear={true}
        size="small"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          border: 0,
          paddingLeft: "1ex",
          width: "100%",
        }}
        addonAfter={
          <SearchControlButtons
            editor={editor}
            decorate={decorate}
            disabled={!search.trim()}
          />
        }
        onKeyDown={async (event) => {
          if (!search.trim()) return;
          if (event.metaKey || event.ctrlKey) {
            if (event.key == "f") {
              event.preventDefault();
              return;
            }
            if (event.key == "g") {
              event.preventDefault();
              if (event.shiftKey) {
                previousMatch(editor, decorate);
              } else {
                nextMatch(editor, decorate);
              }
              return;
            }
          }
          if (event.key == "Enter") {
            event.preventDefault();
            inputRef.current?.blur();
            await delay(100);
            const { selection } = editor;
            if (selection != null) {
              const focus = Range.edges(selection)[0];
              Transforms.setSelection(editor, { focus, anchor: focus });
            }
            nextMatch(editor, decorate);
          }
          if (event.key == "Escape") {
            event.preventDefault();
            setSearch("");
            inputRef.current?.blur();
            await delay(100);
            ReactEditor.focus(editor);
            return;
          }
        }}
      />
    ),
    [search, decorate]
  );

  return {
    decorate,
    Search,
    search,
    inputRef,
    focus: async (search) => {
      if (search?.trim()) {
        setSearch(search);
        await delay(0); // so that the "all" below selects this search.
      }
      inputRef.current?.focus({ cursor: "all" });
    },
    next: () => {
      nextMatch(editor, decorate);
    },
    previous: () => {
      previousMatch(editor, decorate);
    },
  };
};
