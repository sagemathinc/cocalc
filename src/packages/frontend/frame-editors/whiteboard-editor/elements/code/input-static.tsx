import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { codemirrorMode } from "@cocalc/frontend/file-extensions";
import { Element } from "../../types";

export default function InputStatic({ element }: { element: Element }) {
  const mode = codemirrorMode("py"); // TODO!
  return (
    <CodeMirrorStatic
      value={element.str ?? ""}
      font_size={element.data?.fontSize}
      options={{ lineNumbers: false, mode }}
    />
  );
}
