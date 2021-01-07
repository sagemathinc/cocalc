/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component that allows WYSIWYG editing of markdown.

import { delay } from "awaiting";
import { Node, createEditor } from "slate";
import { Slate, ReactEditor, Editable, withReact } from "slate-react";

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
import { Path } from "../../frame-tree/path";

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
  is_current?: boolean;
}

export const EditableMarkdown: React.FC<Props> = ({
  actions,
  font_size,
  read_only,
  value,
  project_id,
  path,
  is_current,
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
    if (!ReactEditor.isFocused(editor)) {
      // ASSUMPTION: The editor never gets changed by the user
      // when it is not focused.  Very important!  Do not change
      // this; or, if you do, you must put in a good "dirty" check
      // instead, since save_value gets called via debounce at
      // random times after the editor is defocused, and this will
      // cause bugs (e.g., type, switch from slate to codemirror, type, and
      // see what you typed into codemirror disappear).
      return;
    }
    actions.set_value(editor_markdown_value());
    actions.ensure_syncstring_is_saved();
  }, []);

  // Make sure to save the state of the slate editor
  // to the syncstring *before* merging in a change
  // from upstream.
  useEffect(() => {
    function before_change() {
      if (ReactEditor.isFocused(editor)) {
        actions.set_value(editor_markdown_value());
      }
    }
    actions.get_syncstring().on("before-change", before_change);
    return () => actions.get_syncstring().off("before-change", before_change);
  }, []);

  // We don't want to do save_value too much, since it presumably can be slow,
  // especially if the document is large. By debouncing, we only do this when
  // the user pauses typing for a moment. Also, this avoids making too many commits.
  const save_value_debounce = useMemo(
    () => debounce(save_value, SAVE_DEBOUNCE_MS),
    []
  );

  const setEditorValueNoJump = useCallback(async (new_value) => {
    ReactEditor.blur(editor);
    setEditorValue(new_value);
    // Critical to wait until after next render loop, or
    // ReactEditor.toDOMPoint below will not detect the problem.
    await delay(0);
    if (editor.selection != null) {
      try {
        ReactEditor.toDOMPoint(editor, editor.selection.anchor);
        ReactEditor.toDOMPoint(editor, editor.selection.focus);
        ReactEditor.focus(editor);
      } catch (_err) {
        // Do not focus -- better than crashing the browser.
        // When the user clicks again to focus, they will choose
        // a valid cursor point.
        // TODO: we need to either figure out where the cursor
        // would move to, etc., or we need to use a sequences of
        // Transforms rather than just setting the editor value.
        // This is of course very hard, but it is the right thing
        // to do in general.
        // Another option might be to insert something in the DOM
        // at the cursor, make changes, find that thing, and put the
        // cursor back there.  But that might not work if it disrupts
        // a user while they are typing.
      }
    }
  }, []);

  useEffect(() => {
    if (value == editorMarkdownValue.current) {
      // Setting to current value, so no-op.
      return;
    }
    editorMarkdownValue.current = value;
    const new_value = markdown_to_slate(value);

    if (ReactEditor.isFocused(editor) && editor.selection != null) {
      setEditorValueNoJump(new_value);
    } else {
      setEditorValue(new_value);
    }
  }, [value]);

  return (
    <div
      className="smc-vfill"
      style={{ overflowY: "auto", backgroundColor: "#eee" }}
    >
      <Path is_current={is_current} path={path} project_id={project_id} />
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
            editorMarkdownValue.current = undefined; // markdown value now not known.
            scroll_hack();
            setEditorValue(new_value);
            save_value_debounce();
          }}
        >
          <Editable
            readOnly={read_only}
            renderElement={Element}
            renderLeaf={Leaf}
            onBlur={() => {
              // save immediately rather than waiting for the debounced save_value.
              // This is important since the user might edit the codemirror instance
              // immediately before the debounced save_value happens.
              // Important: isFocused is still true when onBlur is called,
              // so save_value actually does the save.
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
