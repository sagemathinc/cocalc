/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React, {
  CSSProperties,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Transforms } from "slate";
import { ReactEditor } from "../slate-react";
import { fromTextArea, Editor, commands } from "codemirror";
import {
  DARK_GREY_BORDER,
  CODE_FOCUSED_COLOR,
  CODE_FOCUSED_BACKGROUND,
  SELECTED_COLOR,
} from "../util";
import { useFocused, useSelected, useSlate, useCollapsed } from "./hooks";
import {
  moveCursorToBeginningOfBlock,
  moveCursorUp,
  moveCursorDown,
} from "../control";
import { selectAll } from "../keyboard/select-all";
import infoToMode from "./code-block/info-to-mode";
import { file_associations } from "@cocalc/frontend/file-associations";
import { useRedux } from "@cocalc/frontend/app-framework";
import { isEqual } from "lodash";

const STYLE = {
  width: "100%",
  overflow: "auto",
  overflowX: "hidden",
  border: "1px solid #dfdfdf",
  borderRadius: "8px",
  lineHeight: "1.21429em",
} as CSSProperties;

interface Props {
  onChange?: (string) => void;
  info?: string;
  value: string;
  onShiftEnter?: () => void;
  onEscape?: () => void;
  onBlur?: () => void;
  onFocus?: () => void;
  options?: { [option: string]: any };
  isInline?: boolean; // impacts how cursor moves out of codemirror.
  style?: CSSProperties;
  addonBefore?: ReactNode;
  addonAfter?: ReactNode;
}

export const SlateCodeMirror: React.FC<Props> = React.memo(
  ({
    info,
    value,
    onChange,
    onShiftEnter,
    onEscape,
    onBlur,
    onFocus,
    options: cmOptions,
    isInline,
    style,
    addonBefore,
    addonAfter,
  }) => {
    const focused = useFocused();
    const selected = useSelected();
    const editor = useSlate();
    const collapsed = useCollapsed();
    const { actions } = useFrameContext();
    const { id } = useFrameContext();
    const justBlurred = useRef<boolean>(false);
    const cmRef = useRef<Editor | undefined>(undefined);
    const [isFocused, setIsFocused] = useState<boolean>(!!cmOptions?.autofocus);
    const textareaRef = useRef<any>(null);

    const editor_settings = useRedux(["account", "editor_settings"]);
    const options = useMemo(() => {
      const selectAllKeyboard = (cm) => {
        if (cm.getSelection() != cm.getValue()) {
          // not everything is selected (or editor is empty), so
          // select everything.
          commands.selectAll(cm);
        } else {
          // everything selected, so now select all editor content.
          // NOTE that this only makes sense if we change focus
          // to the enclosing select editor, thus losing the
          // cm editor focus, which is a bit weird.
          ReactEditor.focus(editor);
          selectAll(editor);
        }
      };

      const bindings = editor_settings.get("bindings");
      return {
        ...cmOptions,
        autoCloseBrackets: editor_settings.get("auto_close_brackets", false),
        lineWrapping: editor_settings.get("line_wrapping", true),
        lineNumbers: false, // editor_settings.get("line_numbers", false), // disabled since breaks when scaling in whiteboard, etc. and is kind of weird in edit mode only.
        matchBrackets: editor_settings.get("match_brackets", false),
        theme: editor_settings.get("theme", "default"),
        keyMap:
          bindings == null || bindings == "standard" ? "default" : bindings,
        // The two lines below MUST match with the useEffect above that reacts to changing info.
        mode: cmOptions?.mode ?? infoToMode(info),
        indentUnit:
          cmOptions?.indentUnit ??
          file_associations[info ?? ""]?.opts.indent_unit ??
          4,

        // NOTE: Using the inputStyle of "contenteditable" is challenging
        // because we have to take care that copy doesn't end up being handled
        // by slate and being wrong.  In contrast, textarea does work fine for
        // copy.  However, textarea does NOT work when any CSS transforms
        // are involved, and we use such transforms extensively in the whiteboard.

        inputStyle: "contenteditable" as "contenteditable", // can't change because of whiteboard usage!
        extraKeys: {
          ...cmOptions?.extraKeys,
          "Shift-Enter": () => {
            Transforms.move(editor, { distance: 1, unit: "line" });
            ReactEditor.focus(editor, false, true);
            onShiftEnter?.();
          },
          // We make it so doing select all when not everything is
          // selected selects everything in this local Codemirror.
          // Doing it *again* then selects the entire external slate editor.
          "Cmd-A": selectAllKeyboard,
          "Ctrl-A": selectAllKeyboard,
          ...(onEscape != null ? { Esc: onEscape } : undefined),
        },
      };
    }, [editor_settings, cmOptions]);

    const setCSS = useCallback(
      (css) => {
        if (cmRef.current == null) return;
        $(cmRef.current.getWrapperElement()).css(css);
      },
      [cmRef],
    );

    const focusEditor = useCallback(
      (forceCollapsed?) => {
        if (editor.getIgnoreSelection()) return;
        const cm = cmRef.current;
        if (cm == null) return;
        if (forceCollapsed || collapsed) {
          // collapsed = single cursor, rather than a selection range.
          // focus the CodeMirror editor
          // It is critical to blur the Slate editor
          // itself after focusing codemirror, since otherwise we
          // get stuck in an infinite
          // loop since slate is confused about whether or not it is
          // blurring or getting focused, since codemirror is a contenteditable
          // inside of the slate DOM tree.  Hence this ReactEditor.blur:
          cm.refresh();
          cm.focus();
          ReactEditor.blur(editor);
        }
      },
      [collapsed, options.theme],
    );

    useEffect(() => {
      if (focused && selected && !justBlurred.current) {
        focusEditor();
      }
    }, [selected, focused, options.theme]);

    // If the info line changes update the mode.
    useEffect(() => {
      const cm = cmRef.current;
      if (cm == null) return;
      cm.setOption("mode", infoToMode(info));
      const indentUnit = file_associations[info ?? ""]?.opts.indent_unit ?? 4;
      cm.setOption("indentUnit", indentUnit);
    }, [info]);

    useEffect(() => {
      const node: HTMLTextAreaElement = textareaRef.current;
      if (node == null) return;

      const cm = (cmRef.current = fromTextArea(node, options));

      // The Up/Down/Left/Right key handlers are potentially already
      // taken by a keymap, so we have to add them explicitly using
      // addKeyMap, so that they have top precedence. Otherwise, somewhat
      // randomly, things will seem to "hang" and you get stuck, which
      // is super annoying.
      cm.addKeyMap(cursorHandlers(editor, isInline));

      cm.on("change", (_, _changeObj) => {
        if (onChange != null) {
          onChange(cm.getValue());
        }
      });

      if (onBlur != null) {
        cm.on("blur", onBlur);
      }

      if (onFocus != null) {
        cm.on("focus", onFocus);
      }

      cm.on("blur", () => {
        justBlurred.current = true;
        setTimeout(() => {
          justBlurred.current = false;
        }, 1);
        setIsFocused(false);
      });

      cm.on("focus", () => {
        setIsFocused(true);
        focusEditor(true);
        if (!justBlurred.current) {
          setTimeout(() => focusEditor(true), 0);
        }
      });

      cm.on("copy", (_, event) => {
        // We tell slate to ignore this event.
        // I couldn't find any way to get codemirror to allow the copy to happen,
        // but at the same time to not let the event propogate.  It seems like
        // codemirror also would ignore the event, which isn't useful.
        // @ts-ignore
        event.slateIgnore = true;
      });

      (cm as any).undo = () => {
        actions.undo(id);
      };
      (cm as any).redo = () => {
        actions.redo(id);
      };
      // This enables other functionality (e.g., save).
      (cm as any).cocalc_actions = actions;

      // Make it so editor height matches text.
      const css: any = {
        height: "auto",
        padding: "5px 15px",
      };
      setCSS(css);
      cm.refresh();

      return () => {
        if (cmRef.current == null) return;
        $(cmRef.current.getWrapperElement()).remove();
        cmRef.current = undefined;
      };
    }, []);

    useEffect(() => {
      const cm = cmRef.current;
      if (cm == null) return;
      for (const key in options) {
        const opt = options[key];
        if (!isEqual(cm.options[key], opt)) {
          if (opt != null) {
            cm.setOption(key as any, opt);
          }
        }
      }
    }, [editor_settings]);

    useEffect(() => {
      cmRef.current?.setValueNoJump(value);
    }, [value]);

    const borderColor = isFocused
      ? CODE_FOCUSED_COLOR
      : selected
      ? SELECTED_COLOR
      : DARK_GREY_BORDER;
    return (
      <div
        contentEditable={false}
        style={{
          ...STYLE,
          ...{
            border: `1px solid ${borderColor}`,
            borderRadius: "8px",
          },
          ...style,
          position: "relative",
        }}
        className="smc-vfill"
      >
        {!isFocused && selected && !collapsed && (
          <div
            style={{
              background: CODE_FOCUSED_BACKGROUND,
              position: "absolute",
              opacity: 0.5,
              zIndex: 1,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          ></div>
        )}
        {addonBefore}
        <div
          style={{
            borderLeft: `3px solid ${
              isFocused ? CODE_FOCUSED_COLOR : borderColor
            }`,
          }}
        >
          <textarea ref={textareaRef} defaultValue={value}></textarea>
        </div>
        {addonAfter}
      </div>
    );
  },
);

// TODO: vim version of this...

function cursorHandlers(editor, isInline: boolean | undefined) {
  const exitDown = (cm) => {
    const cur = cm.getCursor();
    const n = cm.lastLine();
    const cur_line = cur?.line;
    const cur_ch = cur?.ch;
    const line = cm.getLine(n);
    const line_length = line?.length;
    if (cur_line === n && cur_ch === line_length) {
      //Transforms.move(editor, { distance: 1, unit: "line" });
      moveCursorDown(editor, true);
      ReactEditor.focus(editor, false, true);
      return true;
    } else {
      return false;
    }
  };

  return {
    Up: (cm) => {
      const cur = cm.getCursor();
      if (cur?.line === cm.firstLine() && cur?.ch == 0) {
        // Transforms.move(editor, { distance: 1, unit: "line", reverse: true });
        moveCursorUp(editor, true);
        if (!isInline) {
          moveCursorToBeginningOfBlock(editor);
        }
        ReactEditor.focus(editor, false, true);
      } else {
        commands.goLineUp(cm);
      }
    },
    Left: (cm) => {
      const cur = cm.getCursor();
      if (cur?.line === cm.firstLine() && cur?.ch == 0) {
        Transforms.move(editor, { distance: 1, unit: "line", reverse: true });
        ReactEditor.focus(editor, false, true);
      } else {
        commands.goCharLeft(cm);
      }
    },
    Right: (cm) => {
      if (!exitDown(cm)) {
        commands.goCharRight(cm);
      }
    },
    Down: (cm) => {
      if (!exitDown(cm)) {
        commands.goLineDown(cm);
      }
    },
  };
}
