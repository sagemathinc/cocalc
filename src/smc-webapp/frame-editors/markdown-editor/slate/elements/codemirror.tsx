/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
TODO: a lot!
- syntax highlight in users theme
- keyboard with user settings
- when info changes update editor
 and so much more!
*/

import { Editor, Range, Transforms } from "slate";
import { ReactEditor } from "../slate-react";
import { file_associations } from "../../../../file-associations";
import {
  CSS,
  React,
  ReactDOM,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "../../../../app-framework";
import * as CodeMirror from "codemirror";
import { FOCUSED_COLOR } from "../util";
import { useFocused, useSelected, useSlate, useCollapsed } from "./register";

const STYLE = {
  width: "100%",
  overflow: "auto",
  overflowX: "hidden",
  border: "1px solid #cfcfcf",
  borderRadius: "5px",
  lineHeight: "1.21429em",
  marginBottom: "1em", // consistent with <p> tag.
  userSelect: "none", // see https://github.com/ianstormtaylor/slate/issues/3723#issuecomment-761566218
} as CSS;

interface Props {
  onChange?: (string) => void;
  info?: string;
  value: string;
  onShiftEnter?: () => void;
  onEscape?: () => void;
  onBlur?: () => void;
  options?: { [option: string]: any };
  isInline?: boolean; // impacts how cursor moves out of codemirror.
}

export const SlateCodeMirror: React.FC<Props> = React.memo(
  ({
    info,
    value,
    onChange,
    onShiftEnter,
    onEscape,
    onBlur,
    options,
    isInline,
  }) => {
    const focused = useFocused();
    const selected = useSelected();
    const editor = useSlate();
    const collapsed = useCollapsed();

    const cmRef = useRef<CodeMirror.Editor | undefined>(undefined);
    const [isFocused, setIsFocused] = useState<boolean>(!!options?.autofocus);
    const textareaRef = useRef<any>(null);

    const setCSS = useCallback(
      (css) => {
        if (cmRef.current == null) return;
        $(cmRef.current.getWrapperElement()).css(css);
      },
      [cmRef]
    );

    const focusEditor = () => {
      const cm = cmRef.current;
      if (cm == null) return;
      if (collapsed) {
        // Put the cursor at the top or bottom,
        // depending on where it was recently:
        // @ts-ignore
        const last = editor.lastSelection?.focus?.path;
        const path = editor.selection?.focus?.path;
        if (last != null && path != null) {
          let cur;
          if (isLessThan(last, path)) {
            // from above
            cur = { line: 0, ch: 0 };
          } else {
            // from below
            cur = {
              line: cm.lastLine(),
              ch: isInline ? cm.getLine(cm.lastLine()).length : 0,
            };
          }
          cm.setCursor(cur);
        }

        // focus the editor
        cm.focus();

        // set the CSS to indicate this
        setCSS({
          backgroundColor: options?.theme != null ? "" : "#f7f7f7",
          color: "",
        });
      } else {
        setCSS({
          backgroundColor: "#1990ff",
          color: "white",
        });
      }
    };

    useEffect(() => {
      if (focused && selected) {
        focusEditor();
      } else {
        setCSS({
          backgroundColor: options?.theme != null ? "" : "#f7f7f7",
          color: "",
        });
      }
    }, [selected, focused, options]);

    useEffect(() => {
      const node: HTMLTextAreaElement = ReactDOM.findDOMNode(
        textareaRef.current
      );
      if (node == null) return;
      if (options == null) options = {};
      if (info) {
        if (info[0] == "{") {
          // Rmarkdown format -- looks like {r stuff,engine=python,stuff}.
          // https://github.com/yihui/knitr-examples/blob/master/023-engine-python.Rmd
          // TODO: For now just do this, but find a spec and parse in the future...
          info = "r";
        }
        const spec = file_associations[info];
        options.mode = spec?.opts.mode ?? info; // if nothing in file associations, maybe info is the mode, e.g. "python".
      } else {
        options.mode = "txt";
      }

      if (options.extraKeys == null) {
        options.extraKeys = {};
      }

      if (onShiftEnter != null) {
        options.extraKeys["Shift-Enter"] = onShiftEnter;
      }

      if (onEscape != null) {
        options.extraKeys["Esc"] = onEscape;
      }

      cursorHandlers(options, editor, isInline);

      const cm = (cmRef.current = CodeMirror.fromTextArea(node, options));

      cm.on("change", (_, _changeObj) => {
        if (onChange != null) {
          onChange(cm.getValue());
        }
      });

      if (onBlur != null) {
        cm.on("blur", onBlur);
      }

      cm.on("blur", () => setIsFocused(false));
      cm.on("focus", async () => {
        setIsFocused(true);
        await delay(1);
        cm.focus();
      });

      // Make it so editor height matches text.
      const css: any = {
        height: "auto",
        padding: "5px",
      };
      if (options.theme == null) {
        css.backgroundColor = "#f7f7f7";
      }
      setCSS(css);

      if (focused && selected) {
        focusEditor();
      }

      cm.refresh();

      return () => {
        if (cmRef.current == null) return;
        $(cmRef.current.getWrapperElement()).remove();
        cmRef.current = undefined;
      };
    }, []);

    useEffect(() => {
      cmRef.current?.setValueNoJump(value);
    }, [value]);

    return (
      <span
        contentEditable={false}
        style={{
          ...STYLE,
          ...{
            border: `2px solid ${isFocused ? FOCUSED_COLOR : "#cfcfcf"}`,
          },
        }}
        className="smc-vfill"
      >
        <textarea ref={textareaRef} defaultValue={value}></textarea>
      </span>
    );
  }
);

function moveCursorToBeginningOfBlock(editor: Editor): void {
  const selection = editor.selection;
  if (selection == null || !Range.isCollapsed(selection)) {
    return;
  }
  const path = [...selection.focus.path];
  if (path.length == 0) return;
  path[path.length - 1] = 0;
  const focus = { path, offset: 0 };
  Transforms.setSelection(editor, { focus, anchor: focus });
}

function cursorHandlers(options, editor, isInline?: boolean): void {
  options.extraKeys["Up"] = (cm) => {
    const cur = cm.getCursor();
    if (cur?.line === cm.firstLine() && cur?.ch == 0) {
      Transforms.move(editor, { distance: 1, unit: "line", reverse: true });
      if (!isInline) {
        moveCursorToBeginningOfBlock(editor);
      }
      ReactEditor.focus(editor);
    } else {
      CodeMirror.commands.goLineUp(cm);
    }
  };

  options.extraKeys["Left"] = (cm) => {
    const cur = cm.getCursor();
    if (cur?.line === cm.firstLine() && cur?.ch == 0) {
      Transforms.move(editor, { distance: 1, unit: "line", reverse: true });
      ReactEditor.focus(editor);
    } else {
      CodeMirror.commands.goCharLeft(cm);
    }
  };

  const exitDown = (cm) => {
    const cur = cm.getCursor();
    const n = cm.lastLine();
    const cur_line = cur?.line;
    const cur_ch = cur?.ch;
    const line = cm.getLine(n);
    const line_length = line?.length;
    if (cur_line === n && cur_ch === line_length) {
      Transforms.move(editor, { distance: 1, unit: "line" });
      ReactEditor.focus(editor);
      return true;
    } else {
      return false;
    }
  };

  options.extraKeys["Right"] = (cm) => {
    if (!exitDown(cm)) {
      CodeMirror.commands.goCharRight(cm);
    }
  };

  options.extraKeys["Down"] = (cm) => {
    if (!exitDown(cm)) {
      CodeMirror.commands.goLineDown(cm);
    }
  };
}

function isLessThan(p1: number[], p2: number[]): boolean {
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    if ((p1[i] ?? 0) < (p2[i] ?? 0)) {
      return true;
    }
  }
  return false;
}
