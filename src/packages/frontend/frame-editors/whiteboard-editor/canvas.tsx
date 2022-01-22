/*
Render the canvas, which is by definition all of the drawing elements
in the whiteboard.

This is NOT an HTML5 canvas.  It has nothing do with that.   We define
"the whiteboard" as everything -- the controls, settings, etc. -- and
the canvas as the area where the actual drawing appears.
*/
import { ReactNode } from "react";
import { Element } from "./types";
import RenderElement from "./elements/render";

interface Props {
  elements: Element[];
  font_size?: number;
  focusedId?: string;
}

export default function Canvas({ elements, font_size, focusedId }: Props) {
  const v: ReactNode[] = [];
  for (const element of elements) {
    const { id, style } = element;
    v.push(
      <div key={id} style={{ ...style, position: "absolute" }}>
        <RenderElement element={element} focused={id == focusedId} />
      </div>
    );
  }

  const zoom = font_size ? font_size / 14 : undefined;

  return (
    <div
      className={"smc-vfill"}
      style={{ zoom, overflow: "scroll", position: "relative", cursor: "text" }}
    >
      {v}
    </div>
  );
}
