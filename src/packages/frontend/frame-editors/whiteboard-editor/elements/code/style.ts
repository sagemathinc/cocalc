import { Element } from "../../types";
import { CSSProperties } from "react";

export default function getStyle(element: Element): CSSProperties {
  return {
    height: "100%",
    overflowY: "auto",
    fontSize: element.data?.fontSize,
    border: element.data?.radius
      ? `${2 * (element.data?.radius ?? 1)}px solid ${
          element.data?.color ?? "#ccc"
        }`
      : undefined,
    borderRadius: "3px",
    padding: "5px",
    background: "white",
  };
}
