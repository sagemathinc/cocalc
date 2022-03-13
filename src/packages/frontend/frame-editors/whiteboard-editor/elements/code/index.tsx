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

  return (
    <div style={getStyle(element)}>
      {!hideInput && focused && (
        <div
          className={editFocus ? "nodrag" : undefined}
          onMouseDown={(e) => {
            if (editFocus) {
              mousePosRef.current = [];
            } else {
              // have to set it to focused since otherwise
              // we can't set it to not focused to unfocus
              // it (since the click to drag focuses the
              // editor internally).
              setEditFocus(true);
              mousePosRef.current = [e.clientX, e.clientY];
            }
          }}
          onMouseUp={(e) => {
            if (mousePosRef.current.length == 0) return;
            if (
              e.clientX == mousePosRef.current?.[0] &&
              e.clientY == mousePosRef.current?.[1]
            ) {
              setEditFocus(true);
            } else {
              // defocus on/after move
              setEditFocus(false);
            }
          }}
        >
          <Input
            isFocused={editFocus}
            element={element}
            focused={focused}
            canvasScale={canvasScale}
            onBlur={() => setEditFocus(false)}
          />
        </div>
      )}
      {!hideInput && !focused && <InputStatic element={element} />}
      {!hideOutput && element.data?.output && (
        <div className="nodrag">
          <Output element={element} />
        </div>
      )}
      {focused && <ControlBar element={element} />}
    </div>
  );
}
