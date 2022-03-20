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
        border: `${((element.data?.radius ?? 0.5) * 2) / canvasScale}px solid ${
          element.data?.color ?? "#252937"
        }`,
        borderRadius: "3px",
        boxShadow: "1px 3px 5px #ccc",
        background: "rgb(200,200,200,0.05)",
      }}
    ></div>
  );
}
