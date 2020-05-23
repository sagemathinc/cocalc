/*
Markdown editor

Stage 1 -- enough to replace current chat input:
  [x] editor themes
  [x] markdown syntax highlighting via codemirror
  [x] spellcheck
  [x] vim/emacs/sublime keybinding modes
  [x] non-monospace font
  [ ] drag and drop and paste of images
  [ ] @mentions (via completion dialog) -the collabs on this project
  [ ] border when focused
  [ ] focus current line
  [ ] placeholder text

Stage 2 -- stretch goal challenges:
---
  [ ] preview
  [ ] directions and links
  [ ] hashtags
  [ ] wysiwyg mode: via prosemirror?   maybe https://github.com/outline/rich-markdown-editor
  [ ] emojis like on github?

Use this for:
  - chat input
  - course editor conf fields involving markdown
  - markdown in jupyter

It will be a controlled component that takes project_id and path as input.
*/

import {
  React,
  ReactDOM,
  useEffect,
  useRef,
  useRedux,
} from "../../app-framework";
import * as CodeMirror from "codemirror";

const STYLE: React.CSSProperties = {
  border: "1px solid rgb(204,204,204)", // focused will be rgb(112, 178, 230);
};

interface Props {
  project_id: string;
  path: string;
  value: string;
  onChange: (value: string) => void;
  enableImages?: boolean; // if true, drag-n-drop and pasted images go in .images/ under a random name.
  enableMentions?: boolean;
  style?: React.CSSProperties;
  onShiftEnter?: () => void;
  onEscape?: () => void;
  onBlur?: () => void;
}
export const MarkdownInput: React.FC<Props> = ({
  project_id,
  path,
  value,
  enableImages,
  enableMentions,
  style,
  onChange,
  onShiftEnter,
  onEscape,
  onBlur,
}) => {
  // @ts-ignore
  const deleteme = [project_id, path, enableImages, enableMentions];

  const cm = useRef<CodeMirror.Editor>();
  const textarea_ref = useRef<HTMLTextAreaElement>(null);
  const theme = useRedux(["account", "editor_settings", "theme"]);
  const bindings = useRedux(["account", "editor_settings", "bindings"]);
  const fontSize = useRedux(["account", "font_size"]);

  useEffect(() => {
    // initialize the codemirror editor
    const node = ReactDOM.findDOMNode(textarea_ref.current);
    const extraKeys: CodeMirror.KeyMap = {};
    if (onShiftEnter != null) {
      extraKeys["Shift-Enter"] = () => onShiftEnter();
    }
    if (onEscape != null) {
      extraKeys["Esc"] = () => onEscape();
    }
    const options = {
      inputStyle: "contenteditable" as "contenteditable", // needed for spellcheck to work!
      spellcheck: true,
      mode: {
        name: "gfm",
      },
      extraKeys,
      styleActiveLine: true,
    };
    cm.current = CodeMirror.fromTextArea(node, options);
    cm.current.setValue(value);
    cm.current.on("change", (editor) => {
      onChange(editor.getValue());
    });

    if (onBlur != null) {
      cm.current.on("blur", () => onBlur());
    }

    const e: any = cm.current.getWrapperElement();
    e.setAttribute("style", "height:100%; font-family:sans-serif !important");

    // clean up
    return () => {
      if (cm.current == null) return;
      cm.current.getWrapperElement().remove();
      cm.current = undefined;
    };
  }, []);

  useEffect(() => {
    cm.current?.setOption("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (bindings == null || bindings == "standard") {
      cm.current?.setOption("keyMap", "default");
    } else {
      cm.current?.setOption("keyMap", bindings);
    }
  }, [bindings]);

  useEffect(() => {
    if (cm.current == null || cm.current.getValue() === value) return;
    cm.current.setValue(value);
  }, [value]);

  return (
    <div style={{ ...STYLE, ...style, ...{ fontSize: `${fontSize}px` } }}>
      <textarea style={{ display: "none" }} ref={textarea_ref} />
    </div>
  );
};
