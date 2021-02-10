/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component that allows WYSIWYG editing of markdown.

const EXPENSIVE_DEBUG = false; // EXTRA SLOW -- turn off before release!

import { IS_FIREFOX } from "../../../feature";

import { EditorState } from "../../frame-tree/types";
import { createEditor, Descendant } from "slate";
import { Slate, ReactEditor, Editable, withReact } from "./slate-react";
import { debounce, isEqual } from "lodash";
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
import { Element } from "./element";
import { Leaf } from "./leaf";
import { withAutoFormat } from "./format";
import { getHandler as getKeyboardHandler } from "./keyboard";

import { useUpload, withUpload } from "./upload";

import { slateDiff } from "./slate-diff";
import { applyOperations } from "./operations";
import { slatePointToMarkdown, indexToPosition } from "./sync";

// (??) A bit longer is better, due to escaping of markdown and multiple users
// with one user editing source and the other editing with slate.
// const SAVE_DEBOUNCE_MS = 1500;
import { SAVE_DEBOUNCE_MS } from "../../code-editor/const";

// Whether or not to use windowing.
// I'm going to disable this by default (for production
// releases), but re-enable it frequently for development.
let USE_WINDOWING = false;
// We set this to be as large as possible, since it might be a while until
// we fully implement cursor/selection handling and windowing properly. In
// the meantime, this will make everything work 100% with at least OVERSCAN_ROW_COUNT
// blocks around the cursor, which handles 99% of cases.   On the other hand,
// in those cases when somebody opens say Moby Dick (with 2000+ blocks),
// it also works at all (rather than just locking the browser!).
const OVERSCAN_ROW_COUNT = 75;
if (USE_WINDOWING && IS_FIREFOX) {
  // Windowing on Firefox results in TONS of problems all over the place, whereas it
  // works fine with Safari and Chrome.  So no matter what we always disable it on
  // Firefox.   See https://github.com/sagemathinc/cocalc/issues/5204 where both
  // problems are caused by windowing.
  USE_WINDOWING = false;
}

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
  is_fullscreen?: boolean;
  editor_state?: EditorState;
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
    is_fullscreen,
    editor_state,
  }) => {
    const editor: ReactEditor = useMemo(() => {
      const cur = actions.getSlateEditor(id);
      if (cur != null) return cur;
      const ed = withUpload(
        withAutoFormat(withIsInline(withIsVoid(withReact(createEditor()))))
      );
      actions.registerSlateEditor(id, ed);
      return ed;
    }, []);

    // todo move to our own context-based hook!
    (editor as any).project_id = project_id;
    (editor as any).path = path;

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const restoreScroll = async () => {
      const scroll = editor_state?.get("scroll");
      if (!scroll || scrollRef.current == null) {
        return;
      }
      const elt = $(scrollRef.current);
      // wait until render happens
      await new Promise(requestAnimationFrame);
      elt.scrollTop(scroll);
      await delay(0);
      // do any scrolling after image loads
      elt.find("img").on("load", function () {
        elt.scrollTop(scroll);
      });
    };
    useEffect(() => {
      if (value != "Loading...") {
        restoreScroll();
      }
    }, [value]);

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

    const saveValue = useCallback((force?) => {
      if (!force && !hasUnsavedChangesRef.current) {
        return;
      }
      if (force) {
        editorMarkdownValueRef.current = undefined;
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
      if (read_only) {
        e.preventDefault();
        return;
      }
      const handler = getKeyboardHandler(e);
      if (handler != null) {
        const extra = { actions, id, hasUnsavedChangesRef };
        if (handler({ editor, extra })) {
          e.preventDefault();
          // key was handled.
          return;
        }
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
        // Important -- ReactEditor.isFocused(editor)  is *false* when
        // you're editing some inline void elements (e.g., code blocks),
        // since the focus leaves slate and goes to codemirror (say).
        if (ReactEditor.isFocused(editor) || is_current) {
          actions.set_value(editor_markdown_value());
        }
      }
      actions.get_syncstring().on("before-change", before_change);
      return () => actions.get_syncstring().off("before-change", before_change);
    }, []);

    useEffect(() => {
      if (value == editorMarkdownValueRef.current) {
        // Setting to current value, so no-op.
        return;
      }

      editorMarkdownValueRef.current = value;
      const previousEditorValue = editor.children;
      const nextEditorValue = markdown_to_slate(value);
      const operations = slateDiff(previousEditorValue, nextEditorValue);
      // Applying this operation below will immediately trigger
      // an onChange, which it is best to ignore to save time and
      // also so we don't update the source editor (and other browsers)
      // with a view with things like loan $'s escaped.'
      (editor as any).ignoreNextOnChange = true;
      applyOperations(editor, operations);

      if (EXPENSIVE_DEBUG) {
        const stringify = require("json-stable-stringify");
        // We use JSON rather than isEqual here, since {foo:undefined}
        // is not equal to {}, but they JSON the same, and this is
        // fine for our purposes.
        if (stringify(editor.children) != stringify(nextEditorValue)) {
          console.log(
            "**BUG!  slateDiff did not properly transform editor! See window.diffBug **"
          );
          (window as any).diffBug = {
            previousEditorValue,
            nextEditorValue,
            editorValue: editor.children,
            operations,
            stringify,
            slateDiff,
          };
        }
      }
    }, [value]);

    /*
    const { Transforms, Editor, Node } = require("slate");
    // not using (window as any) to cause a TS error, so
    // I don't forget to comment this out!
    window.z = {
      editor,
      Transforms,
      ReactEditor,
      Node,
      Editor,
      slateDiff,
      slatePointToMarkdown,
      indexToPosition,
    };
    */

    const [rowStyle, setRowStyle] = useState<CSS>({});

    useEffect(() => {
      setRowStyle({
        maxWidth: `${(1 + (scaling - 1) / 2) * MAX_WIDTH_NUM}px`,
        margin: "auto",
        padding: "0 50px",
        background: "white",
      });
    }, [editor, scaling]);

    async function inverseSearch() {
      if (is_fullscreen || !actions.get_matching_frame({ type: "cm" })) {
        // - if user is fullscreen assume they just want to WYSIWYG edit
        // and double click is to select.
        // - if no source view, also don't do anything.  We only let
        // double click do something when there is an open source view,
        // since double click is used for selecting.
        return;
      }
      // delay to give double click a chance to change current focus.
      // This takes surprisingly long!
      let t = 0;
      while (editor.selection == null) {
        await delay(50);
        t += 50;
        if (t > 2000) return; // give up
      }
      const point = editor.selection?.anchor;
      if (point == null) {
        return;
      }
      const { index, markdown } = slatePointToMarkdown(editor, point);
      if (index == -1) return;
      const pos = indexToPosition({ index, markdown });
      if (pos?.line != null) {
        actions.programmatical_goto_line(
          pos.line + 1, // 1 based (TODO: could use codemirror option)
          true,
          false, // it is REALLY annoying to switch focus to be honest, e.g., because double click to select a word is common in WYSIWYG editing.  If change this to true, make sure to put an extra always 50ms delay above due to focus even order.
          undefined,
          pos.ch
        );
      }
    }

    const onChange = (newEditorValue) => {
      try {
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

        if (!(editor as any).ignoreNextOnChange) {
          hasUnsavedChangesRef.current = true;
          // markdown value now not known.
          editorMarkdownValueRef.current = undefined;
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
      } finally {
        (editor as any).ignoreNextOnChange = false;
      }
    };

    let slate = (
      <Slate editor={editor} value={editorValue} onChange={onChange}>
        <Editable
          className={USE_WINDOWING ? "smc-vfill" : undefined}
          readOnly={read_only}
          renderElement={Element}
          renderLeaf={Leaf}
          onKeyDown={onKeyDown}
          onBlur={saveValue}
          onDoubleClick={inverseSearch}
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
    );

    let body = (
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
          ref={scrollRef}
          onScroll={debounce(() => {
            const scroll = scrollRef.current?.scrollTop;
            if (scroll != null) {
              actions.save_editor_state(id, { scroll });
            }
          }, 200)}
        >
          {slate}
        </div>
      </div>
    );
    return useUpload(project_id, path, editor, body);
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
