/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component that allows WYSIWYG editing of markdown.

import { Node, createEditor } from "slate";
import { Slate, Editable, withReact } from "slate-react";

import { SAVE_DEBOUNCE_MS } from "../../code-editor/const";
import { debounce } from "lodash";
import {
  CSS,
  React,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "../../../app-framework";
import { Actions } from "../actions";

import { MAX_WIDTH_NUM } from "../../options";
import { use_font_size_scaling } from "../../frame-tree/hooks";

import { slate_to_markdown } from "./slate-to-markdown";
import { markdown_to_slate } from "./markdown-to-slate";
import { Element, Leaf } from "./render";

const STYLE = {
  width: "100%",
  margin: "0 auto",
  padding: "50px 75px",
  border: "1px solid lightgrey",
  background: "white",
} as CSS;

interface Props {
  actions: Actions;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  read_only: boolean;
  value: string;
  reload_images: boolean;
}

export const EditableMarkdown: React.FC<Props> = ({
  actions,
  font_size,
  value,
}) => {
  const editor = useMemo(
    () => withIsInline(withIsVoid(withReact(createEditor()))),
    []
  );

  // TODO: DEBUGGING
  (window as any).ed = { editor };

  const editorMarkdownValue = useRef<string | undefined>(undefined);
  const [editor_value, setEditorValue] = useState<Node[]>(() =>
    markdown_to_slate(value)
  );
  const scaling = use_font_size_scaling(font_size);

  const editor_markdown_value = useCallback(() => {
    if (editorMarkdownValue.current != null) {
      return editorMarkdownValue.current;
    }
    editorMarkdownValue.current = slate_to_markdown(editor.children);
    return editorMarkdownValue.current;
  }, []);

  const save_value = useCallback(() => {
    actions.set_value(editor_markdown_value());
    actions.ensure_syncstring_is_saved();
  }, []);

  // We don't want to do save_value too much, since it presumably can be slow,
  // especially if the document is large. By debouncing, we only do this when
  // the user pauses typing for a moment. Also, this avoids making too many commits.
  const save_value_debounce = useMemo(
    () => debounce(save_value, SAVE_DEBOUNCE_MS),
    []
  );

  useEffect(() => {
    if (value == editorMarkdownValue.current) {
      // Setting to current value, so no-op.
      return;
    }
    editorMarkdownValue.current = value;
    setEditorValue(markdown_to_slate(value));
  }, [value]);

  return (
    <div
      className="smc-vfill"
      style={{ overflowY: "auto", backgroundColor: "#eee" }}
    >
      <div
        style={{
          ...STYLE,
          fontSize: font_size,
          maxWidth: `${(1 + (scaling - 1) / 2) * MAX_WIDTH_NUM}px`,
        }}
      >
        <Slate
          editor={editor}
          value={editor_value}
          onChange={(new_value) => {
            scroll_hack();
            setEditorValue(new_value);
            save_value_debounce();
            editorMarkdownValue.current = undefined; // markdown value now not known.
          }}
        >
          <Editable
            renderElement={Element}
            renderLeaf={Leaf}
            onBlur={() => {
              // save immediately rather than waiting for the debounced save_value.
              // This is important since the user might edit the codemirror instance
              // immediately before the debounced save_value happens.
              save_value();
            }}
          />
        </Slate>
      </div>
    </div>
  );
};

const withIsVoid = (editor) => {
  const { isVoid } = editor;

  editor.isVoid = (element) => {
    return element.isVoid != null ? element.isVoid : isVoid(element);
  };

  return editor;
};

const withIsInline = (editor) => {
  const { isInline } = editor;

  editor.isInline = (element) => {
    return element.isInline != null ? element.isInline : isInline(element);
  };

  return editor;
};

// Scroll the current contenteditable cursor into view if necessary.
// This is needed on Chrome (on macOS) at least, but not with Safari.
// This is similar to https://github.com/ianstormtaylor/slate/issues/1032
function scroll_hack() {
  (window.getSelection()?.focusNode
    ?.parentNode as any)?.scrollIntoViewIfNeeded?.();
}
