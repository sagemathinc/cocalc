import { Element } from "../../types";
import ControlBar from "./control";
import Input from "./input";
import Output from "./output";
import getStyle from "./style";

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
}

export default function Code({ element, focused, canvasScale }: Props) {
  const { hideInput, hideOutput } = element.data ?? {};

  return (
    <div className={focused ? "nodrag" : undefined} style={getStyle(element)}>
      {!hideInput && (
        <Input element={element} focused={focused} canvasScale={canvasScale} />
      )}
      {!hideOutput && element.data?.output && <Output element={element} />}
      {focused && <ControlBar element={element} />}
    </div>
  );
}
