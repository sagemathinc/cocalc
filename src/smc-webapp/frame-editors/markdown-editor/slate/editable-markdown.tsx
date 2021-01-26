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
import { SAVE_DEBOUNCE_MS } from "../../code-editor/const";
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
import { ensureEditorPadding } from "./padding";
import { withShortcuts } from "./shortcuts";

import { slateDiff } from "./diff";

//const RENDER_SIZE = 25;

const STYLE = {
  width: "100%",
  border: "1px solid lightgrey",
  background: "white",
  overflowX: "auto",
  margin: "0 auto",
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

async function applyOperations(editor, operations): Promise<void> {
  if (operations.length == 0) return;
  //await new Promise(requestAnimationFrame);
  const t0 = new Date().valueOf();

  const is_focused = ReactEditor.isFocused(editor);
  // IMPORTANT: we use transform to apply all but the last operation,
  // then use editor.apply for the very last operation.  Why?
  // Because editor.apply normalize the document and does a bunch of
  // other things which can easily make it so the operations
  // are no longer valid, e.g., their paths are wrong, etc.
  // Obviously, it is also much better to not normalize every single
  // time too.
  if (is_focused) ReactEditor.blur(editor);
  for (const op of operations.slice(0, operations.length - 1)) {
    Transforms.transform(editor, op);
  }
  editor.apply(operations[operations.length - 1]);
  if (is_focused) ReactEditor.focus(editor);
  console.log(
    `time: apply ${operations.length} operations`,
    new Date().valueOf() - t0,
    "ms"
  );
  (window as any).operations = operations;
  const t1 = new Date().valueOf();
  await new Promise(requestAnimationFrame);
  console.log("time: rendered", new Date().valueOf() - t1, "ms");
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

    const ensureEditorPaddingDebounce = useMemo(
      () => debounce(() => ensureEditorPadding(editor), 300),
      []
    );

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
        // pagraph like enter creates.
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

    /*
    const setEditorValueNoCrash = useCallback(async (new_value) => {
      ReactEditor.blur(editor);
      const t0 = new Date().valueOf();
      setEditorValue(new_value);
      // Critical to wait until after next render loop, or
      // ReactEditor.toDOMPoint below will not detect the problem.
      await new Promise(requestAnimationFrame);
      console.log("render time", new Date().valueOf() - t0);
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
    */

    /*
    const setEditorValueNoJump = useCallback(
      (new_value) => {
        const operations = slateDiff(value, new_value);
        for (const op of operations) {
          editor.apply(op);
        }
      },
      [value]
    );
    */

    useEffect(() => {
      if (value == editorMarkdownValueRef.current) {
        // Setting to current value, so no-op.
        return;
      }
      editorMarkdownValueRef.current = value;
      const nextEditorValue = markdown_to_slate(value);
      const operations = slateDiff(editor.children, nextEditorValue);
      (window as any).diff = {
        operations,
        doc0: editor.children,
        doc1: nextEditorValue,
      };
      applyOperations(editor, operations);
      ensureEditorPaddingDebounce();

      /*
      let editor_value = markdown_to_slate(value);
      if (editor_value.length > RENDER_SIZE) {
        // This code renders long documents in batches, since it's
        // vastly better to immediately *see* your document and be
        // able to scroll as the bottom renders, than to have your
        // entire browser block for 10 seconds.
        const t0 = new Date().valueOf();
        const lazyRender = async (items) => {
          if (!isMountedRef.current) {
            // no longer mounted, so don't do this anymore...
            return;
          }
          if (items.length == 0) {
            // done -- nothing more to append.
            console.log("rendered", new Date().valueOf() - t0, "ms");
            return;
          }
          await new Promise(requestAnimationFrame);
          Transforms.insertNodes(editor, items.slice(0, RENDER_SIZE), {
            at: [editor.children.length],
          });
          lazyRender(items.slice(RENDER_SIZE));
        };
        lazyRender(editor_value.slice(RENDER_SIZE));
        editor_value = editor_value.slice(0, RENDER_SIZE);
      }

      editorMarkdownValueRef.current = value;

      if (ReactEditor.isFocused(editor) && editor.selection != null) {
        setEditorValueNoCrash(editor_value);
      } else {
        setEditorValue(editor_value);
      }
      */
    }, [value]);

    (window as any).z = {
      editor,
      Transforms,
      Node,
      ReactEditor,
      Editor,
    };

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
            value={editorValue}
            onChange={(newEditorValue) => {
              if (editorValue === newEditorValue) {
                // Editor didn't actually change value so nothing to do.
                return;
              }
              hasUnsavedChangesRef.current = true;
              editorMarkdownValueRef.current = undefined; // markdown value now not known.
              if (ReactEditor.isFocused(editor)) {
                // If editor is focused, scroll cursor into view.
                scroll_into_view();
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
              saveValueDebounce();
              ensureEditorPaddingDebounce();
            }}
          >
            <Editable
              style={{ margin: "0 auto", padding: "15px 75px" }}
              readOnly={read_only}
              renderElement={Element}
              renderLeaf={Leaf}
              onKeyDown={!read_only ? onKeyDown : undefined}
              onBlur={save_value}
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
