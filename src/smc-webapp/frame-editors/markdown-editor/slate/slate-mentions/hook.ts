/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MIT (same as slate uses https://github.com/ianstormtaylor/slate/blob/master/License.md)
 */

// Adapted from https://github.com/ianstormtaylor/slate/blob/master/site/examples/mentions.tsx

import { Editor, Range, Transforms } from "slate";
import { ReactEditor } from "../slate-react";
import * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { Complete, Item } from "smc-webapp/editors/markdown-input/complete";

interface Options {
  editor: ReactEditor;
  insertMention: (Editor, string) => void;
  matchingUsers: (search: string) => (string | JSX.Element)[];
}

interface MentionsControl {
  onChange: () => void;
  onKeyDown: (event) => void;
  Mentions: JSX.Element | undefined;
}

export const useMentions: (Options) => MentionsControl = ({
  editor,
  insertMention,
  matchingUsers,
}) => {
  const [target, setTarget] = useState<Range | undefined>();
  const [search, setSearch] = useState("");

  const items: Item[] = useMemo(() => {
    return matchingUsers(search);
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
    [target]
  );

  const onChange = useCallback(async () => {
    await new Promise(requestAnimationFrame);
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [start] = Range.edges(selection);
      const wordBefore = Editor.before(editor, start, { unit: "word" });
      const before = wordBefore && Editor.before(editor, wordBefore);
      const beforeRange = before && Editor.range(editor, before, start);
      const beforeText = beforeRange && Editor.string(editor, beforeRange);
      const beforeMatch = beforeText && beforeText.match(/^@(\w*)$/);
      const after = Editor.after(editor, start);
      const afterRange = Editor.range(editor, start, after);
      const afterText = Editor.string(editor, afterRange);
      const afterMatch = afterText.match(/^(\s|$)/);
      if (beforeMatch && afterMatch) {
        setTarget(beforeRange);
        setSearch(beforeMatch[1]);
        return;
      }
    }

    setTarget(undefined);
  }, [editor]);

  const renderMentions = useCallback(() => {
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

    const onSelect = async (value) => {
      Transforms.select(editor, target);
      insertMention(editor, value);
      setTarget(undefined);
      ReactEditor.focus(editor);
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
    Mentions: renderMentions(),
  };
};
