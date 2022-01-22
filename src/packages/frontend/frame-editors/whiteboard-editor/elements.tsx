/*
Render the elements in the whiteboard.
*/
import { ReactNode } from "react";
import { Element } from "./types";

interface Props {
  elements: Element[];
  font_size?: number;
}

export default function Elements({ elements, font_size }: Props) {
  const v: ReactNode[] = [];
  for (const element of elements) {
    const { id, style, str, data } = element;
    v.push(
      <div key={id} style={{ position: "relative", ...style }}>
        {str != null && str}
        {data != null && <pre>{JSON.stringify(data, undefined, 2)}</pre>}
      </div>
    );
  }

  const zoom = font_size ? font_size / 14 : undefined;

  return (
    <div className={"smc-vfill"} style={{ zoom }}>
      {v}
    </div>
  );
}
