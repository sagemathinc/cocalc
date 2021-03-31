/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MIT (same as slate uses https://github.com/ianstormtaylor/slate/blob/master/License.md)
 */

/* Adapted from
       https://github.com/ianstormtaylor/slate/blob/master/site/examples/mentions.tsx
   One thing that makes this implementation more complicated is that if you just type
   the @ symbol and nothing else, it immediately pops up the mentions dialog.  In
   the demo above, it does not, which is EXTREMELY disconcerting.
*/

import { Editor, Range, Text, Transforms } from "slate";
import { ReactEditor } from "../slate-react";
import * as React from "react";
import { useIsMountedRef } from "smc-webapp/app-framework";
import { useCallback, useMemo, useState } from "react";
import { Complete, Item } from "smc-webapp/editors/markdown-input/complete";
import { debounce } from "lodash";

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
  const isMountedRef = useIsMountedRef();

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

  // we debounce this onChange, since it is VERY expensive and can make typing feel
  // very laggy on a large document!
  const onChange = useCallback(
    debounce(() => {
      try {
        if (!isMountedRef.current) return;
        const { selection } = editor;
        if (selection && Range.isCollapsed(selection)) {
          const { focus } = selection;
          const [current] = Editor.node(editor, focus);
          if (Text.isText(current)) {
            const charBeforeCursor = current.text[focus.offset - 1];
            let afterMatch, beforeMatch, beforeRange, search;
            if (charBeforeCursor == "@") {
              beforeRange = {
                focus: editor.selection.focus,
                anchor: {
                  path: editor.selection.anchor.path,
                  offset: editor.selection.anchor.offset - 1,
                },
              };
              search = "";
              afterMatch = beforeMatch = null;
            } else {
              const wordBefore = Editor.before(editor, focus, { unit: "word" });
              const before = wordBefore && Editor.before(editor, wordBefore);
              beforeRange = before && Editor.range(editor, before, focus);
              const beforeText =
                beforeRange && Editor.string(editor, beforeRange);
              beforeMatch = beforeText && beforeText.match(/^@(\w*)$/);
              search = beforeMatch?.[1];
              const after = Editor.after(editor, focus);
              const afterRange = Editor.range(editor, focus, after);
              const afterText = Editor.string(editor, afterRange);
              afterMatch = afterText.match(/^(\s|$)/);
            }
            if (charBeforeCursor == "@" || (beforeMatch && afterMatch)) {
              setTarget(beforeRange);
              setSearch(search);
              return;
            }
          }
        }

        setTarget(undefined);
      } catch (err) {
        console.log("WARNING -- slate.mentions", err);
      }
    }, 250),
    [editor]
  );

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

    const onSelect = (value) => {
      Transforms.select(editor, target);
      insertMention(editor, value);
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
    Mentions: renderMentions(),
  };
};
