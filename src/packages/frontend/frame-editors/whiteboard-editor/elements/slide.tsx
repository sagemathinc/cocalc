import { Element } from "../types";

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
}

export default function Frame({ element, focused, canvasScale }: Props) {
  focused = focused;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        border: `${
          ((element.data?.radius ?? 0.5) * 2) / canvasScale
        }px solid #eee`,
        borderRadius: "3px",
        boxShadow: "1px 3px 5px #ccc",
        background: "white",
      }}
    ></div>
  );
}
