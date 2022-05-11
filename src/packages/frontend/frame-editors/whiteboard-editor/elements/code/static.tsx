import Input from "./input-static";
import CellOutput from "@cocalc/frontend/jupyter/nbviewer/cell-output";
import { Element } from "../../types";
import getStyle from "./style";
import LRU from "lru-cache";

export default function Code({ element }: { element: Element }) {
  const { hideInput, hideOutput } = element.data ?? {};

  return (
    <div style={getStyle(element)}>
      {!hideInput && <Input element={element} />}
      {!hideOutput && element.data?.output && (
        <CellOutput
          cell={{ id: element.id, output: element.data?.output }}
          more_output={moreOutput.get(element.id)}
        />
      )}
    </div>
  );
}

// For more about this, see the comment in output.tsx.
export const moreOutput = new LRU<string, any>({ max: 50 });
