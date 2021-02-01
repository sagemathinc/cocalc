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
import { debounce, isEqual } from "lodash";
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
import { withAutoFormat, formatSelectedText } from "./format";

import { slateDiff } from "./slate-diff";
import { applyOperations } from "./operations";

// (??) A bit longer is better, due to escaping of markdown and multiple users
// with one user editing source and the other editing with slate.
// const SAVE_DEBOUNCE_MS = 2000;
// Actually, I think the right way to fix this issue is to not merge in upstream
// changes until the active editor (in any way) pauses for 2s (say), and that
// does NOT mean we need to stop saving here.
import { SAVE_DEBOUNCE_MS } from "../../code-editor/const";

// Set this to false for testing.
const USE_WINDOWING = true;
// We set this to be as large as possible, since it might be a while until
// we fully implement cursor/selection handling and windowing properly. In
// the meantime, this will make everything work 100% with at least 300
// blocks around the cursor, which handles 99% of cases.   On the other hand,
// in those cases when somebody opens say Moby Dick (with 2000+ blocks),
// it also works at all (rather than just locking the browser!).
const OVERSCAN_ROW_COUNT = 100;
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
      const ed = withAutoFormat(
        withIsInline(withIsVoid(withReact(createEditor())))
      );
      actions.registerSlateEditor(id, ed);
      return ed;
    }, []);

    // todo move to our own context-based hook!
    (editor as any).project_id = project_id;
    (editor as any).path = path;

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

    const saveValue = useCallback(() => {
      if (!hasUnsavedChangesRef.current) {
        return;
      }
      hasUnsavedChangesRef.current = false;
      actions.set_value(editor_markdown_value());
      actions.ensure_syncstring_is_saved();
    }, []);

    // @ts-ignore
    editor.saveValue = saveValue;

    // We don't want to do saveValue too much, since it presumably can be slow,
    // especially if the document is large. By debouncing, we only do this when
    // the user pauses typing for a moment. Also, this avoids making too many commits.
    const saveValueDebounce = useMemo(
      () => debounce(() => saveValue(), SAVE_DEBOUNCE_MS),
      []
    );

    function onKeyDown(e) {
      if (read_only) return;
      // console.log("onKeyDown", { keyCode: e.keyCode, key: e.key });
      if (e.key == " " && (e.shiftKey || e.ctrlKey || e.metaKey)) {
        // @ts-ignore - that true below is "unsanctioned"
        editor.insertText(" ", true); // true so no format
        e.preventDefault();
        return;
      }
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
          // just switched from focused to not and there was
          // an unsaved change, so save state.
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
              // Track where the last editor selection was,
              // since this is very useful to know, e.g., for
              // understanding cursor movement, format fallback, etc.
              // @ts-ignore
              if (editor.lastSelection == null && editor.selection != null) {
                // initialize
                // @ts-ignore
                editor.lastSelection = editor.curSelection = editor.selection;
              }
              // @ts-ignore
              if (!isEqual(editor.selection, editor.curSelection)) {
                // @ts-ignore
                editor.lastSelection = editor.curSelection;
                if (editor.selection != null) {
                  // @ts-ignore
                  editor.curSelection = editor.selection;
                }
              }
              if (editorValue === newEditorValue) {
                // Editor didn't actually change value so nothing to do.
                return;
              }
              if (!(editor as any).applyingOperations) {
                hasUnsavedChangesRef.current = true;
                editorMarkdownValueRef.current = undefined; // markdown value now not known.
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
            }}
          >
            <Editable
              className={USE_WINDOWING ? "smc-vfill" : undefined}
              readOnly={read_only}
              renderElement={Element}
              renderLeaf={Leaf}
              onKeyDown={!read_only ? onKeyDown : undefined}
              onBlur={saveValue}
              style={
                USE_WINDOWING
                  ? undefined
                  : {
                      maxWidth: `${(1 + (scaling - 1) / 2) * MAX_WIDTH_NUM}px`,
                      minWidth: "80%",
                      margin: "0 auto",
                      padding: "70px",
                      background: "white",
                    }
              }
              windowing={
                USE_WINDOWING
                  ? { rowStyle, overscanRowCount: OVERSCAN_ROW_COUNT }
                  : undefined
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
