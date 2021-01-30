/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component that allows WYSIWYG editing of markdown.

import {
  Editor,
  createEditor,
  Descendant,
  Node,
  Transforms,
  Element as SlateElement,
} from "slate";
import { Slate, ReactEditor, Editable, withReact } from "./slate-react";
import { debounce } from "lodash";
import {
  CSS,
  React,
  useCallback,
  useEffect,
  //useIsMountedRef,
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
import { isElementOfType } from "./elements";
import { Element } from "./element";
import { Leaf } from "./leaf";
import { formatSelectedText } from "./format";
// import { ensureEditorPadding } from "./padding";
import { withShortcuts } from "./shortcuts";

import { slateDiff } from "./slate-diff";
import { applyOperations } from "./operations";

// A bit longer is better, due to escaping of markdown and multiple users
// with one user editing source and the other editing with slate.
const SAVE_DEBOUNCE_MS = 2000;
const USE_WINDOWING = true;
//const USE_WINDOWING = false;

const STYLE = {
  width: "100%",
  border: "1px solid lightgrey",
  overflow: "auto",
  boxShadow: "1px 1px 15px 1px #aaa",
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

/*
// This makes it possible to play around with high keys are
// assigned...
const nodeToKey = new WeakMap();
let id = 0;
ReactEditor.findKey = (editor: ReactEditor, node: Node) => {
  let k = nodeToKey.get(node);
  if (k != null) return k;
  id += 1;
  console.log("key ", id);
  k = { id: `${id}` };
  nodeToKey.set(node, k);
  return k;
};
*/

export const EditableMarkdown: React.FC<Props> = React.memo(
  ({
    actions,
    id,
    font_size,
    read_only,
    value,
    project_id,
    path,
    is_current,
  }) => {
    //const isMountedRef = useIsMountedRef();

    const editor: ReactEditor = useMemo(() => {
      const cur = actions.getSlateEditor(id);
      if (cur != null) return cur;
      const ed = withShortcuts(
        withIsInline(withIsVoid(withReact(createEditor())))
      );
      actions.registerSlateEditor(id, ed);
      return ed;
    }, []);

    const editorMarkdownValueRef = useRef<string | undefined>(undefined);
    const hasUnsavedChangesRef = useRef<boolean>(false);
    // const [editorValue, setEditorValue] = useState<Descendant[]>([]);
    const [editorValue, setEditorValue] = useState<Descendant[]>(() =>
      markdown_to_slate(value)
    );

    const scaling = use_font_size_scaling(font_size);

    const editor_markdown_value = useCallback(() => {
      if (editorMarkdownValueRef.current != null) {
        return editorMarkdownValueRef.current;
      }
      editorMarkdownValueRef.current = slate_to_markdown(editor.children);
      return editorMarkdownValueRef.current;
    }, []);

    const save_value = useCallback(() => {
      if (!hasUnsavedChangesRef.current) {
        return;
      }
      hasUnsavedChangesRef.current = false;
      actions.set_value(editor_markdown_value());
      actions.ensure_syncstring_is_saved();
    }, []);

    // We don't want to do save_value too much, since it presumably can be slow,
    // especially if the document is large. By debouncing, we only do this when
    // the user pauses typing for a moment. Also, this avoids making too many commits.
    const saveValueDebounce = useMemo(
      () => debounce(save_value, SAVE_DEBOUNCE_MS),
      []
    );

    /* const ensureEditorPaddingDebounce = useMemo(
      () => debounce(() => ensureEditorPadding(editor), 300),
      []
    );*/

    function onKeyDown(e) {
      if (read_only) return;
      //console.log("onKeyDown", { keyCode: e.keyCode, key: e.key });
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        if (e.key == "Tab") {
          // Markdown doesn't have a notion of tabs in text...
          // Putting in four spaces for now, but we'll probably change this...
          editor.insertText("    ");
          e.preventDefault();
          return;
        }
        if (e.key == "Enter") {
          const fragment = editor.getFragment();
          const x = fragment?.[0];
          if (isElementOfType(x, ["bullet_list", "ordered_list"])) {
            Transforms.insertNodes(
              editor,
              [{ type: "list_item", children: [{ text: "" }] } as SlateElement],
              {
                match: (node) => isElementOfType(node, "list_item"),
              }
            );
            e.preventDefault();
            return;
          }
        }
      }
      if (e.shiftKey && e.key == "Enter") {
        // In a table, the only option is to insert a <br/>.
        const fragment = editor.getFragment();
        if (isElementOfType(fragment?.[0], "table")) {
          const br = {
            isInline: true,
            isVoid: true,
            type: "html_inline",
            html: "<br />",
            children: [{ text: " " }],
          } as Node;
          Transforms.insertNodes(editor, [br]);
          // Also, move cursor forward so it is *after* the br.
          Transforms.move(editor, { distance: 1 });
          e.preventDefault();
          return;
        }

        // Not in a table, so insert a hard break instead of a new
        // paragraph like enter creates.
        Transforms.insertNodes(editor, [
          {
            type: "hardbreak",
            isInline: true,
            isVoid: false,
            children: [{ text: "\n" }],
          } as Node,
        ]);
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.keyCode == 83) {
        actions.save(true);
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey && e.keyCode == 188) || (e.metaKey && e.keyCode == 189)) {
        actions.change_font_size(-1);
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey && e.keyCode == 190) || (e.metaKey && e.keyCode == 187)) {
        actions.change_font_size(+1);
        e.preventDefault();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.keyCode == 90) {
        if (e.shiftKey) {
          // redo
          actions.redo(id);
        } else {
          // undo
          actions.undo(id);
        }
        hasUnsavedChangesRef.current = false;
        e.preventDefault();
        ReactEditor.focus(editor);
        return;
      }
      if (handleFormatCommands(e)) {
        return;
      }
    }

    function handleFormatCommands(e) {
      if (!(e.ctrlKey || e.metaKey)) {
        return;
      }

      switch (e.key) {
        case "b":
        case "i":
        case "u":
        case "x":
          if (e.key == "x" && !e.shiftKey) return;
          e.preventDefault();
          formatSelectedText(
            editor,
            { b: "bold", i: "italic", u: "underline", x: "strikethrough" }[
              e.key
            ]
          );
          return true;
      }
    }

    useEffect(() => {
      if (!is_current) {
        if (hasUnsavedChangesRef.current) {
          // just switched from focused to not and there was an unsaved change,
          // so save state.
          hasUnsavedChangesRef.current = false;
          actions.set_value(editor_markdown_value());
          actions.ensure_syncstring_is_saved();
        }
      }
    }, [is_current]);

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

    useEffect(() => {
      // NOTE: if we comment this if out and disable escaping, then
      // one can type markdown in the slatejs side and it gets converted
      // to rendered... which is fun but really unpredictable and confusing.
      if (value == editorMarkdownValueRef.current) {
        // Setting to current value, so no-op.
        return;
      }

      editorMarkdownValueRef.current = value;
      const nextEditorValue = markdown_to_slate(value);
      const operations = slateDiff(editor.children, nextEditorValue);
      applyOperations(editor, operations);
      //ensureEditorPaddingDebounce();
    }, [value]);

    (window as any).z = {
      editor,
      Transforms,
      Node,
      ReactEditor,
      Editor,
    };

    const [rowStyle, setRowStyle] = useState<CSS>({});

    useEffect(() => {
      setRowStyle({
        maxWidth: `${(1 + (scaling - 1) / 2) * MAX_WIDTH_NUM}px`,
        margin: "auto",
        padding: "0 50px",
        background: "white",
      });
    }, [editor, scaling]);

    return (
      <div
        className="smc-vfill"
        style={{ overflow: "auto", backgroundColor: "white" }}
      >
        <Path is_current={is_current} path={path} project_id={project_id} />
        <div
          className="smc-vfill"
          style={{
            ...STYLE,
            fontSize: font_size,
          }}
        >
          <Slate
            editor={editor}
            value={editorValue}
            onChange={(newEditorValue) => {
              if (editorValue === newEditorValue) {
                // Editor didn't actually change value so nothing to do.
                return;
              }
              if (!(editor as any).applyingOperations) {
                hasUnsavedChangesRef.current = true;
                editorMarkdownValueRef.current = undefined; // markdown value now not known.
                if (ReactEditor.isFocused(editor)) {
                  // If editor is focused, scroll cursor into view.
                  scroll_into_view();
                }
              }
              setEditorValue(newEditorValue);

              if (!is_current) {
                // Do not save when editor not current since user could be typing
                // into another editor of the same underlying document.   This will
                // cause bugs (e.g., type, switch from slate to codemirror, type, and
                // see what you typed into codemirror disappear). E.g., this
                // happens due to a spurious change when the editor is defocused.

                return;
              }
              if (!(editor as any).applyingOperations) {
                saveValueDebounce();
              }
              //ensureEditorPaddingDebounce();
            }}
          >
            <Editable
              className={USE_WINDOWING ? "smc-vfill" : undefined}
              readOnly={read_only}
              renderElement={Element}
              renderLeaf={Leaf}
              onKeyDown={!read_only ? onKeyDown : undefined}
              onBlur={save_value}
              style={
                USE_WINDOWING
                  ? undefined
                  : {
                      maxWidth: `${(1 + (scaling - 1) / 2) * MAX_WIDTH_NUM}px`,
                      minWidth: "80%",
                      margin: "auto",
                      padding: "70px",
                      background: "white",
                    }
              }
              windowing={
                USE_WINDOWING ? { rowStyle, overscanRowCount: 100 } : undefined
              }
            />
          </Slate>
        </div>
      </div>
    );
  }
);

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
// and is definitely working around a bug in slatejs.
function scroll_into_view() {
  (window.getSelection()?.focusNode
    ?.parentNode as any)?.scrollIntoViewIfNeeded?.();
}
