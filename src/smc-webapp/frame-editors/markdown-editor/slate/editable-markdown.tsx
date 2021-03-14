/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component that allows WYSIWYG editing of markdown.

// important: I made this type **wrong** so I don't
// forget to comment this out.
//const DEBUG: string = true; // do not delete "string"!
const DEBUG = false;

const EXPENSIVE_DEBUG = false; // EXTRA SLOW -- turn off before release!

import { Map } from "immutable";

import { EditorState } from "../../frame-tree/types";
import { createEditor, Descendant, Editor, Range, Transforms } from "slate";
import "./patches";
import { Slate, ReactEditor, Editable, withReact } from "./slate-react";
import { debounce, isEqual } from "lodash";
import {
  CSS,
  React,
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
import { slatePointToMarkdownPosition } from "./sync";

import { useMentions } from "./slate-mentions";
import { mentionableUsers } from "../../../editors/markdown-input/mentionable-users";
import { createMention } from "./elements/mention";
import { submit_mentions } from "../../../editors/markdown-input/mentions";

import { useSearch } from "./search";
import { EditBar, Marks } from "./edit-bar";

import { useBroadcastCursors, useCursorDecorate } from "./cursors";

// (??) A bit longer is better, due to escaping of markdown and multiple users
// with one user editing source and the other editing with slate.
// const SAVE_DEBOUNCE_MS = 1500;
import { SAVE_DEBOUNCE_MS } from "../../code-editor/const";

export interface SlateEditor extends ReactEditor {
  ignoreNextOnChange?: boolean;
  saveValue: (force?) => void;
  dropzoneRef?: any;
  applyingOperations?: boolean;
  lastSelection?: Range;
  curSelection?: Range;
  inverseSearch: (boolean?) => Promise<void>;
  hasUnsavedChanges?: boolean;
  markdownValue?: string;
  getMarkdownValue: () => string;
}

// Whether or not to use windowing (=only rendering visible elements).
// I'm going to disable this by default (for production
// releases), but re-enable it frequently for development.
// There are a LOT of missing features when using windowing,
// including subtle issues with selection, scroll state, etc.
let USE_WINDOWING = true;

// Why window?  Unfortunately, due to how slate is designed, actually editing
// text is "unusable" for even medium size documents
// without using windowing. E.g., with say 200 top level blocks,
// just trying to enter random characters quickly on a superfast laptop
// shows nothing until you pause for a moment.  Totally unacceptable.
// This is for lots of reasons, including things like decorations being
// recomputed, caching not really working, DOM being expensive.
// Even click-dragging and selecting a range breaks often due to
// things being slow.
// In contrast, with windowing, everything is **buttery smooth**.
// Making this overscan small makes things even faster, and also
// minimizes interference when two users are editing at once.
const OVERSCAN_ROW_COUNT = 0;

import { IS_FIREFOX } from "../../../feature";
if (USE_WINDOWING && IS_FIREFOX) {
  // Windowing on Firefox results in TONS of problems all over the place, whereas it
  // works "better" with Safari and Chrome.  So until we fix these (and we will),
  // we disable windowing with Firefox.
  // See https://github.com/sagemathinc/cocalc/issues/5204 where both
  // problems are caused by windowing.
  USE_WINDOWING = false;
}

const STYLE = {
  width: "100%",
  overflow: "auto",
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
  cursors: Map<string, any>;
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
    cursors,
  }) => {
    const [editorValue, setEditorValue] = useState<Descendant[]>(() =>
      markdown_to_slate(value)
    );

    const editor = useMemo(() => {
      const cur = actions.getSlateEditor(id);
      if (cur != null) return cur;
      const ed = withUpload(
        withAutoFormat(withIsInline(withIsVoid(withReact(createEditor()))))
      ) as SlateEditor;
      actions.registerSlateEditor(id, ed);

      ed.getMarkdownValue = () => {
        if (ed.markdownValue != null && !ed.hasUnsavedChanges) {
          return ed.markdownValue;
        }
        ed.markdownValue = slate_to_markdown(ed.children);
        return ed.markdownValue;
      };

      ed.saveValue = (force?) => {
        if (!force && !editor.hasUnsavedChanges) {
          return;
        }
        if (force) {
          editor.markdownValue = undefined;
        }
        editor.hasUnsavedChanges = false;
        setSyncstringFromSlate();

        actions.ensure_syncstring_is_saved();
      };

      return ed as SlateEditor;
    }, []);

    const mentions = useMentions({
      editor,
      insertMention: (editor, account_id) => {
        Transforms.insertNodes(editor, [createMention(account_id)]);
        submit_mentions(project_id, path, [{ account_id, description: "" }]);
      },
      matchingUsers: (search) => mentionableUsers(project_id, search),
    });

    const search = useSearch();

    const [marks, setMarks] = useState<Marks>(getMarks(editor));
    const updateMarks = useMemo(() => {
      const f = () => {
        // NOTE: important to debounce, and that this update happens
        // sometime in the near future and not immediately on any change!
        // Don't do it in the update loop where it is requested
        // since that causes issues, e.g.., try to move cursor out
        // of a code block.
        if (!ReactEditor.isFocused(editor)) {
          setMarks({});
        } else {
          setMarks(getMarks(editor));
        }
      };
      // We debounce to avoid performance implications while typing and
      // for the reason mentioned in the NOTE above.
      return debounce(f, 500);
    }, []);

    const broadcastCursors = useBroadcastCursors({
      editor,
      broadcastCursors: (x) => actions.set_cursor_locs(x),
    });
    const cursorDecorate = useCursorDecorate({
      editor,
      cursors,
      value,
      search,
    });

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

    const scaling = use_font_size_scaling(font_size);

    function setSyncstringFromSlate() {
      actions.set_value(editor.getMarkdownValue());
    }

    // We don't want to do saveValue too much, since it presumably can be slow,
    // especially if the document is large. By debouncing, we only do this when
    // the user pauses typing for a moment. Also, this avoids making too many commits.
    const saveValueDebounce = useMemo(
      () => debounce(() => editor.saveValue(), SAVE_DEBOUNCE_MS),
      []
    );

    function onKeyDown(e) {
      if (read_only) {
        e.preventDefault();
        return;
      }

      mentions.onKeyDown(e);
      if (e.defaultPrevented) return;

      const handler = getKeyboardHandler(e);
      if (handler != null) {
        const extra = { actions, id };
        if (handler({ editor, extra })) {
          e.preventDefault();
          // key was handled.
          return;
        }
      }
    }

    useEffect(() => {
      if (!is_current) {
        if (editor.hasUnsavedChanges) {
          // just switched from focused to not and there was
          // an unsaved change, so save state.
          editor.hasUnsavedChanges = false;
          setSyncstringFromSlate();
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
        if (ReactEditor.isFocused(editor) && is_current) {
          setSyncstringFromSlate();
        }
      }
      actions.get_syncstring().on("before-change", before_change);
      return () => actions.get_syncstring().off("before-change", before_change);
    }, []);

    useEffect(() => {
      if (value == editor.markdownValue) {
        // Setting to current value, so no-op.
        return;
      }

      editor.markdownValue = value;
      const previousEditorValue = editor.children;
      const nextEditorValue = markdown_to_slate(value);
      const operations = slateDiff(previousEditorValue, nextEditorValue);
      // Applying this operation below will immediately trigger
      // an onChange, which it is best to ignore to save time and
      // also so we don't update the source editor (and other browsers)
      // with a view with things like loan $'s escaped.'
      if (operations.length > 0) {
        editor.ignoreNextOnChange = true;
        applyOperations(editor, operations);
      }

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

    if (DEBUG) {
      const { Editor, Node } = require("slate");
      (window as any).z = {
        editor,
        Transforms,
        ReactEditor,
        Node,
        Editor,
      };
    }

    const [rowStyle, setRowStyle] = useState<CSS>({});

    useEffect(() => {
      setRowStyle({
        maxWidth: `${(1 + (scaling - 1) / 2) * MAX_WIDTH_NUM}px`,
        margin: "auto",
        padding: "0 50px",
        background: "white",
      });
    }, [editor, scaling]);

    editor.inverseSearch = async function inverseSearch(
      force?: boolean
    ): Promise<void> {
      if (
        !force &&
        (is_fullscreen || !actions.get_matching_frame({ type: "cm" }))
      ) {
        // - if user is fullscreen assume they just want to WYSIWYG edit
        // and double click is to select.  They can use sync button to
        // force opening source panel.
        // - if no source view, also don't do anything.  We only let
        // double click do something when there is an open source view,
        // since double click is used for selecting.
        return;
      }
      // delay to give double click a chance to change current focus.
      // This takes surprisingly long!
      let t = 0;
      while (editor.selection == null) {
        await delay(1);
        t += 50;
        if (t > 2000) return; // give up
      }
      const point = editor.selection?.anchor; // using anchor since double click selects word.
      if (point == null) {
        return;
      }
      const pos = slatePointToMarkdownPosition(editor, point);
      if (pos == null) return;
      actions.programmatical_goto_line(
        pos.line + 1, // 1 based (TODO: could use codemirror option)
        true,
        false, // it is REALLY annoying to switch focus to be honest, e.g., because double click to select a word is common in WYSIWYG editing.  If change this to true, make sure to put an extra always 50ms delay above due to focus even order.
        undefined,
        pos.ch
      );
    };

    const onChange = (newEditorValue) => {
      broadcastCursors();
      updateMarks();
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

        if (!editor.ignoreNextOnChange) {
          editor.hasUnsavedChanges = true;
          // markdown value now not known.
          editor.markdownValue = undefined;
        }

        setEditorValue(newEditorValue);

        // Update mentions state whenever editor actually changes.
        // This may pop up the mentions selector.
        mentions.onChange();

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
        editor.ignoreNextOnChange = false;
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
          onBlur={() => {
            editor.saveValue();
            updateMarks();
          }}
          onFocus={updateMarks}
          decorate={cursorDecorate}
          divref={scrollRef}
          onScroll={debounce(() => {
            const scroll = scrollRef.current?.scrollTop;
            if (scroll != null) {
              actions.save_editor_state(id, { scroll });
            }
          }, 200)}
          style={
            USE_WINDOWING
              ? undefined
              : {
                  position: "relative", // CRITICAL!!! Without this, editor will sometimes scroll the entire frame off the screen.  Do NOT delete position:'relative'.  5+ hours of work to figure this out!  Note that this isn't needed when using windowing above.
                  minWidth: "80%",
                  padding: "70px",
                  background: "white",
                  overflow:
                    "auto" /* for this overflow, see https://github.com/ianstormtaylor/slate/issues/3706 */,
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
        <EditBar
          Search={search.Search}
          isCurrent={is_current}
          marks={marks}
          editor={editor}
        />
        <div
          className="smc-vfill"
          style={{
            ...STYLE,
            fontSize: font_size,
          }}
        >
          {mentions.Mentions}
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

function getMarks(editor) {
  try {
    return Editor.marks(editor) ?? {};
  } catch (err) {
    // If the selection is at a non-leaf node somehow,
    // then marks aren't defined and raises an error.
    //console.log("Editor.marks", err);
    return {};
  }
}
