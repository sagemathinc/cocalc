import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import CellOutput from "@cocalc/frontend/jupyter/nbviewer/cell-output";
import { codemirrorMode } from "@cocalc/frontend/file-extensions";
import { Element } from "../../types";
import getStyle from "./style";

export default function Code({ element }: { element: Element }) {
  const mode = codemirrorMode("py"); // TODO!

  const { hideInput, hideOutput } = element.data ?? {};

  return (
    <div style={getStyle(element)}>
      {!hideInput && (
        <CodeMirrorStatic
          value={element.str ?? ""}
          font_size={element.data?.fontSize}
          options={{ lineNumbers: false, mode }}
        />
      )}
      {!hideOutput && element.data?.output && (
        <CellOutput cell={{ id: element.id, output: element.data?.output }} />
      )}
    </div>
  );
}
