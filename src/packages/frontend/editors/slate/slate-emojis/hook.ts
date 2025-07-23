/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MIT (same as slate uses https://github.com/ianstormtaylor/slate/blob/master/License.md)
 */

import { debounce } from "lodash";
import React, { useCallback, useMemo, useState } from "react";
import { Editor, Range, Text, Transforms } from "slate";

import { useIsMountedRef } from "@cocalc/frontend/app-framework";
import {
  Complete,
  Item,
} from "@cocalc/frontend/editors/markdown-input/complete";
import { field_cmp } from "@cocalc/util/misc";
import emojis from "markdown-it-emoji/lib/data/full.json";
import lite from "markdown-it-emoji/lib/data/light.json";
import { ReactEditor } from "../slate-react";

const MAX_MATCHES = 200;
const EMOJIS_ALL: Item[] = [];
const EMOJIS_LITE: Item[] = [];
function init() {
  for (const value in emojis) {
    EMOJIS_ALL.push({ label: `${emojis[value]}\t ${value}`, value });
  }
  EMOJIS_ALL.sort(field_cmp("value"));

  for (const value in lite) {
    EMOJIS_LITE.push({ label: `${lite[value]}\t ${value}`, value });
  }
  EMOJIS_LITE.sort(field_cmp("value"));
  EMOJIS_LITE.push({
    label: "(type to search thousands of emojis)",
    value: "",
  });
}

interface Options {
  editor: ReactEditor;
  insertEmoji: (editor: Editor, content: string, markup: string) => void;
}

interface EmojisControl {
  onChange: () => void;
  onKeyDown: (event) => void;
  Emojis: React.JSX.Element | undefined;
}

export const useEmojis: (Options) => EmojisControl = ({
  editor,
  insertEmoji,
}) => {
  if (EMOJIS_ALL.length == 0) {
    init();
  }
  const [target, setTarget] = useState<Range | undefined>();
  const [search, setSearch] = useState("");
  const isMountedRef = useIsMountedRef();

  const items: Item[] = useMemo(() => {
    if (!search) {
      // just show most popular
      return EMOJIS_LITE;
    }
    // actual search: show MAX_MATCHES matches
    const v: Item[] = [];
    for (const x of EMOJIS_ALL) {
      if (x.value.includes(search)) {
        v.push(x);
        if (v.length > MAX_MATCHES) {
          v.push({ label: "(type more to search emojis)", value: "" });
          return v;
        }
      }
    }
    return v;
  }, [search]);

  const onKeyDown = useCallback(
    (event) => {
      if (target == null) return;
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Tab":
        case "Enter":
          event.preventDefault();
          break;
        case "Escape":
          event.preventDefault();
          setTarget(undefined);
          break;
      }
    },
    [target],
  );

  // we debounce this onChange, since it is VERY expensive and can make typing feel
  // very laggy on a large document!
  // Also, we only show the emoji dialog on :[something] rather than just :, since
  // it is incredibly annoying and common to do the following:   something here.  See
  // what I just did?  For the @ mentions, there's no common use in english of @[space].
  const onChange = useCallback(
    debounce(() => {
      try {
        if (!isMountedRef.current) return;
        const { selection } = editor;
        if (!selection || !Range.isCollapsed(selection)) return;
        const { focus } = selection;
        let current;
        try {
          [current] = Editor.node(editor, focus);
        } catch (_err) {
          // I think due to debounce, somehow this Editor.node above is
          // often invalid while user is typing.
          return;
        }
        if (!Text.isText(current)) return;

        const charBeforeCursor = current.text[focus.offset - 1];
        let afterMatch, beforeMatch, beforeRange, search;
        if (charBeforeCursor == ":") {
          return;
        }
        const wordBefore = Editor.before(editor, focus, { unit: "word" });
        const before = wordBefore && Editor.before(editor, wordBefore);
        beforeRange = before && Editor.range(editor, before, focus);
        const beforeText = beforeRange && Editor.string(editor, beforeRange);
        if (beforeText == ":") {
          return;
        }
        beforeMatch = beforeText && beforeText.match(/^:(\w*)$/);
        search = beforeMatch?.[1];
        const after = Editor.after(editor, focus);
        const afterRange = Editor.range(editor, focus, after);
        const afterText = Editor.string(editor, afterRange);
        afterMatch = afterText.match(/^(\s|$)/);
        if (charBeforeCursor == ":" || (beforeMatch && afterMatch)) {
          search = search.toLowerCase().trim();
          setSearch(search);
          setTarget(beforeRange);
          return;
        }

        setTarget(undefined);
      } catch (err) {
        console.log("WARNING -- slate.emojis", err);
      }
    }, 250),
    [editor],
  );

  const renderEmojis = useCallback(() => {
    if (target == null) return;
    let domRange;
    try {
      domRange = ReactEditor.toDOMRange(editor, target);
    } catch (_err) {
      // target gets set by the onChange handler above, so editor could
      // have changed by the time we call toDOMRange here, making
      // the target no longer meaningful.  Thus this try/catch is
      // completely reasonable (alternatively, when we deduce the target,
      // we also immediately set the domRange in a ref).
      return;
    }

    const onSelect = (markup) => {
      Transforms.select(editor, target);
      insertEmoji(editor, emojis[markup] ?? "?", markup);
      setTarget(undefined);
      ReactEditor.focus(editor);
      // Move the cursor forward 2 spaces:
      Transforms.move(editor, { distance: 2, unit: "character" });
    };

    const rect = domRange.getBoundingClientRect();
    return React.createElement(Complete, {
      items,
      onSelect,
      onCancel: () => setTarget(undefined),
      position: {
        top: rect.bottom,
        left: rect.left + rect.width,
      },
    });
  }, [search, target]);

  return {
    onChange,
    onKeyDown,
    Emojis: renderEmojis(),
  };
};
