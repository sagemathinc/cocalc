import Input from "./input-static";
import CellOutput from "@cocalc/frontend/jupyter/nbviewer/cell-output";
import { Element } from "../../types";
import getStyle from "./style";

export default function Code({ element }: { element: Element }) {
  const { hideInput, hideOutput } = element.data ?? {};

  return (
    <div style={getStyle(element)}>
      {!hideInput && <Input element={element} />}
      {!hideOutput && element.data?.output && (
        <CellOutput cell={{ id: element.id, output: element.data?.output }} />
      )}
    </div>
  );
}
