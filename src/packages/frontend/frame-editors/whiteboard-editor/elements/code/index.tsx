import { CSSProperties } from "react";
import { Element } from "../../types";
import ControlBar from "./control";
import Input from "./input";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function Code({ element, focused }: Props) {
  const style = {
    height: "100%",
    overflowY: "auto",
    fontSize: element.data?.fontSize,
    border: `${2 * (element.data?.radius ?? 1)}px solid ${
      element.data?.color ?? "#ccc"
    }`,
    borderRadius: "5px",
    padding: "5px",
    background: "white",
  } as CSSProperties;

  const { hideInput } = element.data ?? {};

  return (
    <div className={focused ? "nodrag" : undefined} style={style}>
      {!hideInput && <Input element={element} focused={focused} />}
      {/* hideInput && (hideOutput || !element.data?.output) && (
        <Icon name="jupyter" />
      )*/}
      {focused && <ControlBar element={element} />}
    </div>
  );
}
