import { Element } from "../../types";
import ControlBar from "./control";
import Input from "./input";
import InputStatic from "./input-static";
import Output from "./output";
import getStyle from "./style";
import useEditFocus from "../edit-focus";
import useMouseClickDrag from "../mouse-click-drag";

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
  cursors?: { [account_id: string]: any[] };
}

export default function Code({
  element,
  focused,
  canvasScale,
  cursors,
}: Props) {
  const { hideInput, hideOutput } = element.data ?? {};
  const [editFocus, setEditFocus] = useEditFocus(false);
  const mouseClickDrag = useMouseClickDrag({ editFocus, setEditFocus });

  const renderInput = () => {
    if (hideInput) return;
    if (focused || cursors != null) {
      return (
        <div className={editFocus ? "nodrag" : undefined} {...mouseClickDrag}>
          <Input
            cursors={cursors}
            isFocused={focused && editFocus}
            element={element}
            focused={focused}
            canvasScale={canvasScale}
            onBlur={() => setEditFocus(false)}
          />
        </div>
      );
    }
    return <InputStatic element={element} />;
  };

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
