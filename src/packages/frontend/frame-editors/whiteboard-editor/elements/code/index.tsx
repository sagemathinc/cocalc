import { Element } from "../../types";
import ControlBar from "./control";
import Input from "./input";
import InputStatic from "./input-static";
import Output from "./output";
import getStyle from "./style";
import { useRef, useState } from "react";

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
}

export default function Code({ element, focused, canvasScale }: Props) {
  const { hideInput, hideOutput } = element.data ?? {};
  const [editFocus, setEditFocus] = useState<boolean>(false);
  const mousePosRef = useRef<number[]>([]);

  function renderInput() {
    if (hideInput) return;
    if (editFocus) {
      return (
        <Input
          element={element}
          focused={focused}
          canvasScale={canvasScale}
          onBlur={() => setEditFocus(false)}
        />
      );
    }
    if (focused) {
      return (
        <div
          onMouseDown={(e) => {
            mousePosRef.current = [e.clientX, e.clientY];
          }}
          onMouseUp={(e) => {
            if (
              e.clientX == mousePosRef.current?.[0] &&
              e.clientY == mousePosRef.current?.[1]
            ) {
              setEditFocus(true);
            } else {
              // defocus on move
              setEditFocus(false);
            }
          }}
        >
          <InputStatic element={element} />
        </div>
      );
    }
    return <InputStatic element={element} />;
  }

  return (
    <div style={getStyle(element)}>
      {renderInput()}
      {!hideOutput && element.data?.output && (
        <div className="nodrag">
          <Output element={element} />
        </div>
      )}
      {focused && <ControlBar element={element} />}
    </div>
  );
}
