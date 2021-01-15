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

import { file_associations } from "../../../file-associations";
import {
  CSS,
  React,
  ReactDOM,
  useEffect,
  useRef,
  useState,
} from "../../../app-framework";
import * as CodeMirror from "codemirror";
import { FOCUSED_COLOR } from "./util";

const STYLE = {
  width: "100%",
  overflow: "auto",
  overflowX: "hidden",
  border: "1px solid #cfcfcf",
  borderRadius: "2px",
  lineHeight: "1.21429em",
  marginBottom: "1em", // consistent with <p> tag.
} as CSS;

interface Props {
  onChange?: (string) => void;
  info?: string;
  value: string;
  onShiftEnter?: () => void;
  onEscape?: () => void;
  onBlur?: () => void;
  options?: { [option: string]: any };
}
export const SlateCodeMirror: React.FC<Props> = React.memo(
  ({ info, value, onChange, onShiftEnter, onEscape, onBlur, options }) => {
    const cmRef = useRef<CodeMirror.Editor | undefined>(undefined);
    const [isFocused, setIsFocused] = useState<boolean>(!!options?.autofocus);
    const textareaRef = useRef<any>(null);

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
      cm.on("focus", () => setIsFocused(true));

      // Make it so editor height matches text.
      const css: any = { height: "auto", padding: "5px" };
      if (options.theme == null) {
        css.backgroundColor = "#f7f7f7";
      }
      $(cm.getWrapperElement()).css(css);

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
          ...{ /* The focused color is "Jupyter notebook classic" focused cell green. */
            border: `1px solid ${isFocused ? FOCUSED_COLOR : "#cfcfcf"}`,
          },
        }}
        className="smc-vfill"
      >
        <textarea ref={textareaRef} defaultValue={value}></textarea>
      </span>
    );
  }
);
