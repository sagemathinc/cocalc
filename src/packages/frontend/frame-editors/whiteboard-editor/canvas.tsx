/*
Render the canvas, which is by definition all of the drawing elements
in the whiteboard.

This is NOT an HTML5 canvas.  It has nothing do with that.   We define
"the whiteboard" as everything -- the controls, settings, etc. -- and
the canvas as the area where the actual drawing appears.
*/
import { ReactNode } from "react";
import { Element } from "./types";

interface Props {
  elements: Element[];
  font_size?: number;
}

export default function Canvas({ elements, font_size }: Props) {
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
