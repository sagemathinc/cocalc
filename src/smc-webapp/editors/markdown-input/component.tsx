/*
Markdown editor

Ultimate stretch goal: write a typescript markdown editor with:
  - user theme
  - optional drag and drop and paste for images
  - markdown syntax highlighting via codemirror
  - @mentions (via completion dialog) -- the collabs on this project
  - preview
  - directions and links
  - spellcheck
  - hashtags
  - wysiwyg mode -- via prosemirror?   maybe https://github.com/outline/rich-markdown-editor
  - emojis like on github?
  - vim/emacs/sublime keybinding modes

Use this for:
  - chat input
  - markdown input in various places (e.g., course editor?)

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
  border: "1px solid lightgrey",
};

interface Props {
  project_id: string;
  path: string;
  value: string;
  onChange: (value: string) => void;
  enableImages?: boolean; // if true, drag-n-drop and pasted images go in .images/ under a random name.
  style?: React.CSSProperties;
  onKeyDown?: (event) => void;
}
export const MarkdownInput: React.FC<Props> = ({
  project_id,
  path,
  value,
  enableImages,
  style,
  onKeyDown,
  onChange,
}) => {
  const cm = useRef<CodeMirror.Editor>();
  const textarea_ref = useRef<HTMLTextAreaElement>(null);
  const theme = useRedux(["account", "editor_settings", "theme"]);
  const bindings = useRedux(["account", "editor_settings", "bindings"]);
  const fontSize = useRedux(["account", "font_size"]);

  useEffect(() => {
    // initialize the codemirror editor
    const node = ReactDOM.findDOMNode(textarea_ref.current);
    const options = {
      spellcheck: true,
      mode: {
        name: "gfm",
      },
    };
    cm.current = CodeMirror.fromTextArea(node, options);
    cm.current.setValue(value);
    cm.current.on("change", (editor) => {
      onChange(editor.getValue());
    });
    if (onKeyDown != null) {
      cm.current.on("keydown", onKeyDown);
    }

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

  return (
    <div style={{ ...STYLE, ...style, ...{ fontSize: `${fontSize}px` } }}>
      {project_id} {path} {enableImages}
      <hr />
      <textarea style={{ display: "none" }} ref={textarea_ref} />
    </div>
  );
};
