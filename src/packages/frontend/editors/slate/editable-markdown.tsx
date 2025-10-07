/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Component that allows WYSIWYG editing of markdown.

const EXPENSIVE_DEBUG = false;
// const EXPENSIVE_DEBUG = (window as any).cc != null && true; // EXTRA SLOW -- turn off before release!

import { delay } from "awaiting";
import { Map } from "immutable";
import { debounce, isEqual, throttle } from "lodash";
import {
  MutableRefObject,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CSS, React, useIsMountedRef } from "@cocalc/frontend/app-framework";
import { SubmitMentionsRef } from "@cocalc/frontend/chat/types";
import { useMentionableUsers } from "@cocalc/frontend/editors/markdown-input/mentionable-users";
import { submit_mentions } from "@cocalc/frontend/editors/markdown-input/mentions";
import { EditorFunctions } from "@cocalc/frontend/editors/markdown-input/multimode";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Path } from "@cocalc/frontend/frame-editors/frame-tree/path";
import { DEFAULT_FONT_SIZE } from "@cocalc/util/consts/ui";
import { EditorState } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { markdown_to_html } from "@cocalc/frontend/markdown";
import Fragment, { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import { Descendant, Editor, Range, Transforms, createEditor } from "slate";
import { resetSelection } from "./control";
import * as control from "./control";
import { useBroadcastCursors, useCursorDecorate } from "./cursors";
import { EditBar, useLinkURL, useListProperties, useMarks } from "./edit-bar";
import { Element } from "./element";
import { estimateSize } from "./elements";
import { createEmoji } from "./elements/emoji/index";
import { withInsertBreakHack } from "./elements/link/editable";
import { createMention } from "./elements/mention/editable";
import { Mention } from "./elements/mention/index";
import { withAutoFormat } from "./format";
import { getHandler as getKeyboardHandler } from "./keyboard";
import Leaf from "./leaf-with-cursor";
import { markdown_to_slate } from "./markdown-to-slate";
import { withNormalize } from "./normalize";
import { applyOperations, preserveScrollPosition } from "./operations";
import { withNonfatalRange } from "./patches";
import { withIsInline, withIsVoid } from "./plugins";
import { getScrollState, setScrollState } from "./scroll";
import { SearchHook, useSearch } from "./search";
import { slateDiff } from "./slate-diff";
import { useEmojis } from "./slate-emojis";
import { useMentions } from "./slate-mentions";
import { Editable, ReactEditor, Slate, withReact } from "./slate-react";
import { slate_to_markdown } from "./slate-to-markdown";
import { slatePointToMarkdownPosition } from "./sync";
import type { SlateEditor } from "./types";
import { Actions } from "./types";
import useUpload from "./upload";
import { ChangeContext } from "./use-change";

export type { SlateEditor };

// Whether or not to use windowing by default (=only rendering visible elements).
// This is unfortunately essential.  I've tried everything I can think
// of to optimize slate without using windowing, and I just can't do it
// (and my attempts have always been misleading).  I think the problem is
// that all the subtle computations that are done when selection, etc.
// gets updated, just have to be done one way or another anyways. Doing
// them without the framework of windowing is probably much harder.
// NOTE: we also fully use slate without windowing in many context in which
// we're editing small snippets of Markdown, e.g., Jupyter notebook markdown
// cells, task lists, whiteboard sticky notes, etc.
const USE_WINDOWING = true;
// const USE_WINDOWING = false;

const STYLE: CSS = {
  width: "100%",
  overflow: "auto",
} as const;

interface Props {
  value?: string;
  placeholder?: string;
  actions?: Actions;
  read_only?: boolean;
  font_size?: number;
  id?: string;
  reload_images?: boolean; // I think this is used only to trigger an update
  is_current?: boolean;
  is_fullscreen?: boolean;
  editor_state?: EditorState;
  cursors?: Map<string, any>;
  hidePath?: boolean;
  disableWindowing?: boolean;
  style?: CSS;
  pageStyle?: CSS;
  editBarStyle?: CSS;
  onFocus?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  hideSearch?: boolean;
  saveDebounceMs?: number;
  noVfill?: boolean;
  divRef?: RefObject<HTMLDivElement>;
  selectionRef?: MutableRefObject<{
    setSelection: Function;
    getSelection: Function;
  } | null>;
  height?: string; // css style or if "auto", then editor will grow to size of content instead of scrolling.
  onCursorTop?: () => void;
  onCursorBottom?: () => void;
  isFocused?: boolean;
  registerEditor?: (editor: EditorFunctions) => void;
  unregisterEditor?: () => void;
  getValueRef?: MutableRefObject<() => string>; // see comment in src/packages/frontend/editors/markdown-input/multimode.tsx
  submitMentionsRef?: SubmitMentionsRef; // when called this will submit all mentions in the document, and also returns current value of the document (for compat with markdown editor).  If not set, mentions are submitted when you create them.  This prop is used mainly for implementing chat, which has a clear "time of submission".
  editBar2?: MutableRefObject<React.JSX.Element | undefined>;
  dirtyRef?: MutableRefObject<boolean>;
  minimal?: boolean;
  controlRef?: MutableRefObject<{
    moveCursorToEndOfLine: () => void;
  } | null>;
  showEditBar?: boolean;
}

export const EditableMarkdown: React.FC<Props> = React.memo((props: Props) => {
  const {
    actions: actions0,
    autoFocus,
    cursors,
    dirtyRef,
    disableWindowing = !USE_WINDOWING,
    divRef,
    editBar2,
    editBarStyle,
    editor_state,
    font_size: font_size0,
    getValueRef,
    height,
    hidePath,
    hideSearch,
    id: id0,
    is_current,
    is_fullscreen,
    isFocused,
    minimal,
    noVfill,
    onBlur,
    onCursorBottom,
    onCursorTop,
    onFocus,
    pageStyle,
    placeholder,
    read_only,
    registerEditor,
    saveDebounceMs = SAVE_DEBOUNCE_MS,
    selectionRef,
    style,
    submitMentionsRef,
    unregisterEditor,
    value,
    controlRef,
    showEditBar,
  } = props;
  const { project_id, path, desc, isVisible } = useFrameContext();
  const isMountedRef = useIsMountedRef();
  const id = id0 ?? "";
  const actions = actions0 ?? {};
  const font_size = font_size0 ?? desc?.get("font_size") ?? DEFAULT_FONT_SIZE; // so possible to use without specifying this.  TODO: should be from account settings
  const [change, setChange] = useState<number>(0);

  const editor = useMemo(() => {
    const ed = withNonfatalRange(
      withInsertBreakHack(
        withNormalize(
          withAutoFormat(withIsInline(withIsVoid(withReact(createEditor())))),
        ),
      ),
    ) as SlateEditor;
    actions.registerSlateEditor?.(id, ed);

    ed.getSourceValue = (fragment?) => {
      return fragment ? slate_to_markdown(fragment) : ed.getMarkdownValue();
    };

    // hasUnsavedChanges is true if the children changed
    // since last time resetHasUnsavedChanges() was called.
    ed._hasUnsavedChanges = false;
    ed.resetHasUnsavedChanges = () => {
      delete ed.markdownValue;
      ed._hasUnsavedChanges = ed.children;
    };
    ed.hasUnsavedChanges = () => {
      if (ed._hasUnsavedChanges === false) {
        // initially no unsaved changes
        return false;
      }
      return ed._hasUnsavedChanges !== ed.children;
    };

    ed.markdownValue = value;
    ed.getMarkdownValue = () => {
      if (ed.markdownValue != null && !ed.hasUnsavedChanges()) {
        return ed.markdownValue;
      }
      ed.markdownValue = slate_to_markdown(ed.children, {
        cache: ed.syncCache,
      });
      return ed.markdownValue;
    };

    ed.selectionIsCollapsed = () => {
      return ed.selection == null || Range.isCollapsed(ed.selection);
    };

    if (getValueRef != null) {
      getValueRef.current = ed.getMarkdownValue;
    }

    ed.getPlainValue = (fragment?) => {
      const markdown = ed.getSourceValue(fragment);
      return $("<div>" + markdown_to_html(markdown) + "</div>").text();
    };

    ed.saveValue = (force?) => {
      if (!force && !editor.hasUnsavedChanges()) {
        return;
      }
      setSyncstringFromSlate();
      actions.ensure_syncstring_is_saved?.();
    };

    ed.syncCache = {};
    if (selectionRef != null) {
      selectionRef.current = {
        setSelection: (selection: any) => {
          if (!selection) return;
          // We confirm that the selection is valid.
          // If not, this will throw an error.
          const { anchor, focus } = selection;
          Editor.node(editor, anchor);
          Editor.node(editor, focus);
          ed.selection = selection;
        },
        getSelection: () => {
          return ed.selection;
        },
      };
    }

    if (controlRef != null) {
      controlRef.current = {
        moveCursorToEndOfLine: () => control.moveCursorToEndOfLine(ed),
      };
    }

    ed.onCursorBottom = onCursorBottom;
    ed.onCursorTop = onCursorTop;

    return ed as SlateEditor;
  }, []);

  // hook up to syncstring if available:
  useEffect(() => {
    if (actions._syncstring == null) return;
    const beforeChange = setSyncstringFromSlateNOW;
    const change = () => {
      setEditorToValue(actions._syncstring.to_str());
    };
    actions._syncstring.on("before-change", beforeChange);
    actions._syncstring.on("change", change);
    return () => {
      if (actions._syncstring == null) {
        // This can be null if doc closed before unmounting.  I hit a crash because of this in production.
        return;
      }
      actions._syncstring.removeListener("before-change", beforeChange);
      actions._syncstring.removeListener("change", change);
    };
  }, []);

  useEffect(() => {
    if (registerEditor != null) {
      registerEditor({
        set_cursor: ({ y }) => {
          // This is used for navigating in Jupyter.  Of course cursors
          // or NOT given by x,y positions in Slate, so we have to interpret
          // this as follows, since that's what is used by our Jupyter actions.
          //    y = 0: top of document
          //    y = -1: bottom of document
          let path;
          if (y == 0) {
            // top of doc
            path = [0, 0];
          } else if (y == -1) {
            // bottom of doc
            path = [editor.children.length - 1, 0];
          } else {
            return;
          }
          const focus = { path, offset: 0 };
          Transforms.setSelection(editor, {
            focus,
            anchor: focus,
          });
        },
        get_cursor: () => {
          const point = editor.selection?.anchor;
          if (point == null) {
            return { x: 0, y: 0 };
          }
          const pos = slatePointToMarkdownPosition(editor, point);
          if (pos == null) return { x: 0, y: 0 };
          const { line, ch } = pos;
          return { y: line, x: ch };
        },
      });

      return unregisterEditor;
    }
  }, [registerEditor, unregisterEditor]);

  useEffect(() => {
    if (isFocused == null) return;
    if (ReactEditor.isFocused(editor) != isFocused) {
      if (isFocused) {
        ReactEditor.focus(editor);
      } else {
        ReactEditor.blur(editor);
      }
    }
  }, [isFocused]);

  const [editorValue, setEditorValue] = useState<Descendant[]>(() =>
    markdown_to_slate(value ?? "", false, editor.syncCache),
  );

  const rowSizeEstimator = useCallback((node) => {
    return estimateSize({ node, fontSize: font_size });
  }, []);

  const mentionableUsers = useMentionableUsers();

  const mentions = useMentions({
    isVisible,
    editor,
    insertMention: (editor, account_id) => {
      Transforms.insertNodes(editor, [
        createMention(account_id),
        { text: " " },
      ]);
      if (submitMentionsRef == null) {
        // submit immediately, since no ref for controlling this:
        submit_mentions(project_id, path, [{ account_id, description: "" }]);
      }
    },
    matchingUsers: (search) => mentionableUsers(search, { avatarLLMSize: 16 }),
  });

  const emojis = useEmojis({
    editor,
    insertEmoji: (editor, content, markup) => {
      Transforms.insertNodes(editor, [
        createEmoji(content, markup),
        { text: " " },
      ]);
    },
  });

  useEffect(() => {
    if (submitMentionsRef != null) {
      submitMentionsRef.current = (
        fragmentId?: FragmentId,
        onlyValue = false,
      ) => {
        if (project_id == null || path == null) {
          throw Error(
            "project_id and path must be set in order to use mentions.",
          );
        }

        if (!onlyValue) {
          const fragment_id = Fragment.encode(fragmentId);

          // No mentions in the document were already sent, so we send them now.
          // We have to find all mentions in the document tree, and submit them.
          const mentions: {
            account_id: string;
            description: string;
            fragment_id: string;
          }[] = [];
          for (const [node, path] of Editor.nodes(editor, {
            at: { path: [], offset: 0 },
            match: (node) => node["type"] == "mention",
          })) {
            const [parent] = Editor.parent(editor, path);
            mentions.push({
              account_id: (node as Mention).account_id,
              description: slate_to_markdown([parent]),
              fragment_id,
            });
          }

          submit_mentions(project_id, path, mentions);
        }
        const value = editor.getMarkdownValue();
        return value;
      };
    }
  }, [submitMentionsRef]);

  const search: SearchHook = useSearch({ editor });

  const { marks, updateMarks } = useMarks(editor);

  const { linkURL, updateLinkURL } = useLinkURL(editor);

  const { listProperties, updateListProperties } = useListProperties(editor);

  const updateScrollState = useMemo(() => {
    const { save_editor_state } = actions;
    if (save_editor_state == null) return () => {};
    if (disableWindowing) {
      return throttle(() => {
        if (!isMountedRef.current || !didRestoreScrollRef.current) return;
        const scroll = scrollRef.current?.scrollTop;
        if (scroll != null) {
          save_editor_state(id, { scroll });
        }
      }, 250);
    } else {
      return throttle(() => {
        if (!isMountedRef.current || !didRestoreScrollRef.current) return;
        const scroll = getScrollState(editor);
        if (scroll != null) {
          save_editor_state(id, { scroll });
        }
      }, 250);
    }
  }, []);

  const broadcastCursors = useBroadcastCursors({
    editor,
    broadcastCursors: (x) => actions.set_cursor_locs?.(x),
  });

  const cursorDecorate = useCursorDecorate({
    editor,
    cursors,
    value: value ?? "",
    search,
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didRestoreScrollRef = useRef<boolean>(false);
  const restoreScroll = useMemo(() => {
    return async () => {
      if (didRestoreScrollRef.current) return; // so we only ever do this once.
      try {
        const scroll = editor_state?.get("scroll");
        if (!scroll) return;

        if (!disableWindowing) {
          // Restore scroll for windowing
          try {
            await setScrollState(editor, scroll.toJS());
          } catch (err) {
            // could happen, e.g, if we change the format or change windowing.
            console.log(`restoring scroll state -- ${err}`);
          }
          return;
        }

        // Restore scroll for no windowing.
        // scroll = the scrollTop position, though we wrap in
        // exception since it could be anything.
        await new Promise(requestAnimationFrame);
        if (scrollRef.current == null || !isMountedRef.current) {
          return;
        }
        const elt = $(scrollRef.current);
        try {
          elt.scrollTop(scroll);
          // scrolling after image loads
          elt.find("img").on("load", () => {
            if (!isMountedRef.current) return;
            elt.scrollTop(scroll);
          });
        } catch (_) {}
      } finally {
        didRestoreScrollRef.current = true;
        setOpacity(undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (actions._syncstring == null) {
      setEditorToValue(value);
    }
    if (value != "Loading...") {
      restoreScroll();
    }
  }, [value]);

  const lastSetValueRef = useRef<string | null>(null);

  const setSyncstringFromSlateNOW = () => {
    if (actions.set_value == null) {
      // no way to save the value out (e.g., just beginning to test
      // using the component).
      return;
    }
    if (!editor.hasUnsavedChanges()) {
      // there are no changes to save
      return;
    }

    const markdown = editor.getMarkdownValue();
    lastSetValueRef.current = markdown;
    actions.set_value(markdown);
    actions.syncstring_commit?.();

    // Record that the syncstring's value is now equal to ours:
    editor.resetHasUnsavedChanges();
  };

  const setSyncstringFromSlate = useMemo(() => {
    if (saveDebounceMs) {
      return debounce(setSyncstringFromSlateNOW, saveDebounceMs);
    } else {
      // this case shouldn't happen
      return setSyncstringFromSlateNOW;
    }
  }, []);

  // We don't want to do saveValue too much, since it presumably can be slow,
  // especially if the document is large. By debouncing, we only do this when
  // the user pauses typing for a moment. Also, this avoids making too many commits.
  // For tiny documents, user can make this small or even 0 to not debounce.
  const saveValueDebounce =
    saveDebounceMs != null && !saveDebounceMs
      ? () => editor.saveValue()
      : useMemo(
          () =>
            debounce(
              () => editor.saveValue(),
              saveDebounceMs ?? SAVE_DEBOUNCE_MS,
            ),
          [],
        );

  function onKeyDown(e) {
    if (read_only) {
      e.preventDefault();
      return;
    }

    mentions.onKeyDown(e);
    emojis.onKeyDown(e);

    if (e.defaultPrevented) return;

    if (!ReactEditor.isFocused(editor)) {
      // E.g., when typing into a codemirror editor embedded
      // in slate, we get the keystrokes, but at the same time
      // the (contenteditable) editor itself is not focused.
      return;
    }

    const handler = getKeyboardHandler(e);
    if (handler != null) {
      const extra = { actions, id, search };
      if (handler({ editor, extra })) {
        e.preventDefault();
        // key was handled.
        return;
      }
    }
  }

  useEffect(() => {
    if (!is_current) {
      if (editor.hasUnsavedChanges()) {
        // just switched from focused to not and there was
        // an unsaved change, so save state.
        setSyncstringFromSlate();
        actions.ensure_syncstring_is_saved?.();
      }
    }
  }, [is_current]);

  const setEditorToValue = (value) => {
    // console.log("setEditorToValue", { value, ed: editor.getMarkdownValue() });
    if (lastSetValueRef.current == value) {
      // this always happens once right after calling setSyncstringFromSlateNOW
      // and it can randomly undo the last thing done, so don't do that!
      // Also, this is an excellent optimization to do as well.
      lastSetValueRef.current = null;
      // console.log("setEditorToValue: skip");
      return;
    }
    if (value == null) return;
    if (value == editor.getMarkdownValue()) {
      // nothing to do, and in fact doing something
      // could be really annoying, since we don't want to
      // autoformat via markdown everything immediately,
      // as ambiguity is resolved while typing...
      return;
    }
    const previousEditorValue = editor.children;

    // we only use the latest version of the document
    // for caching purposes.
    editor.syncCache = {};
    // There is an assumption here that markdown_to_slate produces
    // a document that is properly normalized.  If that isn't the
    // case, things will go horribly wrong, since it'll be impossible
    // to convert the document to equal nextEditorValue.  In the current
    // code we do nomalize the output of markdown_to_slate, so
    // that assumption is definitely satisfied.
    const nextEditorValue = markdown_to_slate(value, false, editor.syncCache);

    try {
      //const t = new Date();

      if (
        // length is basically changing from "Loading..."; in this case, just reset everything, rather than transforming via operations (which preserves selection, etc.)
        previousEditorValue.length <= 1 &&
        nextEditorValue.length >= 40 &&
        !ReactEditor.isFocused(editor)
      ) {
        // This is a **MASSIVE** optimization.  E.g., for a few thousand
        // lines markdown file with about 500 top level elements (and lots
        // of nested lists), applying operations below starting with the
        // empty document can take 5-10 seconds, whereas just setting the
        // value is instant.  The drawback to directly setting the value
        // is only that it messes up selection, and it's difficult
        // to know where to move the selection to after changing.
        // However, if the editor isn't focused, we don't have to worry
        // about selection at all.  TODO: we might be able to avoid the
        // slateDiff stuff entirely via some tricky stuff, e.g., managing
        // the cursor on the plain text side before/after the change, since
        // codemirror is much faster att "setValueNoJump".
        // The main time we use this optimization here is when opening the
        // document in the first place, in which case we're converting
        // the document from "Loading..." to it's initial value.
        // Also, the default config is source text focused on the left and
        // editable text acting as a preview on the right not focused, and
        // again this makes things fastest.
        // DRAWBACK: this doesn't preserve scroll position and breaks selection.
        editor.syncCausedUpdate = true;
        // we call "onChange" instead of setEditorValue, since
        // we want all the change handler stuff to happen, e.g.,
        // broadcasting cursors.
        onChange(nextEditorValue);
        // console.log("time to set directly ", new Date() - t);
      } else {
        const operations = slateDiff(previousEditorValue, nextEditorValue);
        if (operations.length == 0) {
          // no actual change needed.
          return;
        }
        // Applying this operation below will trigger
        // an onChange, which it is best to ignore to save time and
        // also so we don't update the source editor (and other browsers)
        // with a view with things like loan $'s escaped.'
        editor.syncCausedUpdate = true;
        // console.log("setEditorToValue: applying operations...", { operations });
        preserveScrollPosition(editor, operations);
        applyOperations(editor, operations);
        // console.log("time to set via diff", new Date() - t);
      }
    } finally {
      // In all cases, now that we have transformed editor into the new value
      // let's save the fact that we haven't changed anything yet and we
      // know the markdown state with zero changes.  This is important, so
      // we don't save out a change if we don't explicitly make one.
      editor.resetHasUnsavedChanges();
      editor.markdownValue = value;
    }

    try {
      if (editor.selection != null) {
        // console.log("setEditorToValue: restore selection", editor.selection);
        const { anchor, focus } = editor.selection;
        Editor.node(editor, anchor);
        Editor.node(editor, focus);
      }
    } catch (err) {
      // TODO!
      console.warn(
        "slate - invalid selection after upstream patch. Resetting selection.",
        err,
      );
      // set to beginning of document -- better than crashing.
      resetSelection(editor);
    }

    //       if ((window as any).cc?.slate != null) {
    //         (window as any).cc.slate.eval = (s) => console.log(eval(s));
    //       }

    if (EXPENSIVE_DEBUG) {
      const stringify = require("json-stable-stringify");
      // We use JSON rather than isEqual here, since {foo:undefined}
      // is not equal to {}, but they JSON the same, and this is
      // fine for our purposes.
      if (stringify(editor.children) != stringify(nextEditorValue)) {
        // NOTE -- this does not 100% mean things are wrong.  One case where
        // this is expected behavior is if you put the cursor at the end of the
        // document, say right after a horizontal rule,  and then edit at the
        // beginning of the document in another browser.  The discrepancy
        // is because a "fake paragraph" is placed at the end of the browser
        // so your cursor has somewhere to go while you wait and type; however,
        // that space is not really part of the markdown document, and it goes
        // away when you move your cursor out of that space.
        console.warn(
          "**WARNING:  slateDiff might not have properly transformed editor, though this may be fine. See window.diffBug **",
        );
        (window as any).diffBug = {
          previousEditorValue,
          nextEditorValue,
          editorValue: editor.children,
          stringify,
          slateDiff,
          applyOperations,
          markdown_to_slate,
          value,
        };
      }
    }
  };

  if ((window as any).cc != null) {
    // This only gets set when running in cc-in-cc dev mode.
    const { Editor, Node, Path, Range, Text } = require("slate");
    (window as any).cc.slate = {
      slateDiff,
      editor,
      actions,
      editor_state,
      Transforms,
      ReactEditor,
      Node,
      Path,
      Editor,
      Range,
      Text,
      scrollRef,
      applyOperations,
      markdown_to_slate,
      robot: async (s: string, iterations = 1) => {
        /*
        This little "robot" function is so you can run rtc on several browsers at once,
        with each typing random stuff at random, and checking that their input worked
        without loss of data.
        */
        let inserted = "";
        let focus = editor.selection?.focus;
        if (focus == null) throw Error("must have selection");
        let lastOffset = focus.offset;
        for (let n = 0; n < iterations; n++) {
          for (const x of s) {
            //               Transforms.setSelection(editor, {
            //                 focus,
            //                 anchor: focus,
            //               });
            editor.insertText(x);
            focus = editor.selection?.focus;
            if (focus == null) throw Error("must have selection");
            inserted += x;
            const offset = focus.offset;
            console.log(
              `${
                n + 1
              }/${iterations}: inserted '${inserted}'; focus="${JSON.stringify(
                editor.selection?.focus,
              )}"`,
            );
            if (offset != (lastOffset ?? 0) + 1) {
              console.error("SYNC FAIL!!", { offset, lastOffset });
              return;
            }
            lastOffset = offset;
            await delay(100 * Math.random());
            if (Math.random() < 0.2) {
              await delay(2 * SAVE_DEBOUNCE_MS);
            }
          }
        }
        console.log("SUCCESS!");
      },
    };
  }

  editor.inverseSearch = async function inverseSearch(
    force?: boolean,
  ): Promise<void> {
    if (
      !force &&
      (is_fullscreen || !actions.get_matching_frame?.({ type: "cm" }))
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
    actions.programmatical_goto_line?.(
      pos.line + 1, // 1 based (TODO: could use codemirror option)
      true,
      false, // it is REALLY annoying to switch focus to be honest, e.g., because double click to select a word is common in WYSIWYG editing.  If change this to true, make sure to put an extra always 50ms delay above due to focus even order.
      undefined,
      pos.ch,
    );
  };

  // WARNING: onChange does not fire immediately after changes occur.
  // It is fired by react and happens in some potentialy later render
  // loop after changes.  Thus you absolutely can't depend on it in any
  // way for checking if the state of the editor has changed.  Instead
  // check editor.children itself explicitly.
  const onChange = (newEditorValue) => {
    if (dirtyRef != null) {
      // but see comment above
      dirtyRef.current = true;
    }
    if (editor._hasUnsavedChanges === false) {
      // just for initial change.
      editor._hasUnsavedChanges = undefined;
    }
    if (!isMountedRef.current) return;
    broadcastCursors();
    updateMarks();
    updateLinkURL();
    updateListProperties();
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

    setEditorValue(newEditorValue);
    setChange(change + 1);

    // Update mentions state whenever editor actually changes.
    // This may pop up the mentions selector.
    mentions.onChange();
    // Similar for emojis.
    emojis.onChange();

    if (!is_current) {
      // Do not save when editor not current since user could be typing
      // into another editor of the same underlying document.   This will
      // cause bugs (e.g., type, switch from slate to codemirror, type, and
      // see what you typed into codemirror disappear). E.g., this
      // happens due to a spurious change when the editor is defocused.

      return;
    }
    saveValueDebounce();
  };

  useEffect(() => {
    editor.syncCausedUpdate = false;
  }, [editorValue]);

  const [opacity, setOpacity] = useState<number | undefined>(0);

  if (editBar2 != null) {
    editBar2.current = (
      <EditBar
        Search={search.Search}
        isCurrent={is_current}
        marks={marks}
        linkURL={linkURL}
        listProperties={listProperties}
        editor={editor}
        style={{ ...editBarStyle, paddingRight: 0 }}
        hideSearch={hideSearch}
      />
    );
  }

  let slate = (
    <Slate editor={editor} value={editorValue} onChange={onChange}>
      <Editable
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={
          !disableWindowing && height != "auto" ? "smc-vfill" : undefined
        }
        readOnly={read_only}
        renderElement={Element}
        renderLeaf={Leaf}
        onKeyDown={onKeyDown}
        onBlur={() => {
          editor.saveValue();
          updateMarks();
          onBlur?.();
        }}
        onFocus={() => {
          updateMarks();
          onFocus?.();
        }}
        decorate={cursorDecorate}
        divref={scrollRef}
        onScroll={updateScrollState}
        style={
          !disableWindowing
            ? undefined
            : {
                height,
                position: "relative", // CRITICAL!!! Without this, editor will sometimes scroll the entire frame off the screen.  Do NOT delete position:'relative'.  5+ hours of work to figure this out!  Note that this isn't needed when using windowing above.
                minWidth: "80%",
                padding: "70px",
                background: "white",
                overflow:
                  height == "auto"
                    ? "hidden" /* for height='auto' we never want a scrollbar  */
                    : "auto" /* for this overflow, see https://github.com/ianstormtaylor/slate/issues/3706 */,
                ...pageStyle,
              }
        }
        windowing={
          !disableWindowing
            ? {
                rowStyle: {
                  // WARNING: do *not* use margin in rowStyle.
                  padding: minimal ? 0 : "0 70px",
                  overflow: "hidden", // CRITICAL: this makes it so the div height accounts for margin of contents (e.g., p element has margin), so virtuoso can measure it correctly.  Otherwise, things jump around like crazy.
                  minHeight: "1px", // virtuoso can't deal with 0-height items
                },
                marginTop: "40px",
                marginBottom: "40px",
                rowSizeEstimator,
              }
            : undefined
        }
      />
    </Slate>
  );
  let body = (
    <ChangeContext.Provider value={{ change, editor }}>
      <div
        ref={divRef}
        className={noVfill || height === "auto" ? undefined : "smc-vfill"}
        style={{
          overflow: noVfill || height === "auto" ? undefined : "auto",
          backgroundColor: "white",
          ...style,
          height,
          minHeight: height == "auto" ? "50px" : undefined,
        }}
      >
        {!hidePath && (
          <Path is_current={is_current} path={path} project_id={project_id} />
        )}
        {showEditBar && (
          <EditBar
            Search={search.Search}
            isCurrent={is_current}
            marks={marks}
            linkURL={linkURL}
            listProperties={listProperties}
            editor={editor}
            style={editBarStyle}
            hideSearch={hideSearch}
          />
        )}
        <div
          className={noVfill || height == "auto" ? undefined : "smc-vfill"}
          style={{
            ...STYLE,
            fontSize: font_size,
            height,
            opacity,
          }}
        >
          {mentions.Mentions}
          {emojis.Emojis}
          {slate}
        </div>
      </div>
    </ChangeContext.Provider>
  );
  return useUpload(editor, body);
});
