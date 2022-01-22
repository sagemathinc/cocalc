/*
Render the canvas, which is by definition all of the drawing elements
in the whiteboard.

This is NOT an HTML5 canvas.  It has nothing do with that.   We define
"the whiteboard" as everything -- the controls, settings, etc. -- and
the canvas as the area where the actual drawing appears.
*/
import { ReactNode, useEffect, useRef } from "react";
import { Element } from "./types";
import RenderElement from "./elements/render";

interface Props {
  elements: Element[];
  font_size?: number;
  focusedId?: string;
  margin?: number;
}

export default function Canvas({
  elements,
  font_size,
  focusedId,
  margin,
}: Props) {
  const canvasRef = useRef<any>(null);
  const scale = font_size ? font_size / 14 : 1;
  const scaledMargin = (margin ?? 1000) / scale;
  useEffect(() => {
    const { current } = canvasRef;
    if (current != null) {
      current.scrollTop = scaledMargin;
      current.scrollLeft = scaledMargin;
    }
  }, []);

  const v: ReactNode[] = [];
  const transforms = getTransforms(elements, scaledMargin);
  for (const element of elements) {
    const { id, style } = element;
    const { x, y } = element;
    if (x == null || y == null) continue; // invalid element!
    const t = transforms.dataToWindow(x, y);
    v.push(
      <div
        key={id}
        style={{
          ...style,
          position: "absolute",
          left: t.x,
          top: t.y,
        }}
      >
        <RenderElement element={element} focused={id == focusedId} />
      </div>
    );
  }

  function handleClick(e) {
    const { clientX, clientY } = e;
    const c = canvasRef.current;
    window.c = c;
    if (c == null) return;
    const rect = c.getBoundingClientRect();
    if (rect == null) return;
    const left = c.scrollLeft + clientX - rect.left;
    const top = c.scrollTop + clientY - rect.top;
    console.log("clicked on", { scale, left, top });
    console.log({
      scale,
      scrollLeft: c.scrollLeft,
      clientX,
      rect_left: rect.left,
      left,
    });
  }

  return (
    <div
      className={"smc-vfill"}
      ref={canvasRef}
      style={{ overflow: "scroll", cursor: "text" }}
      onClick={handleClick}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "relative",
        }}
      >
        {v}

        {/*This hidden div ensures the containing div is big enough to contain everything and a margin*/}
        <div
          style={{
            position: "absolute",
            left: transforms.width,
            top: transforms.height,
          }}
        >
          XXX
        </div>
      </div>
    </div>
  );
}

function getTransforms(
  elements,
  margin
): {
  dataToWindow: (x: number, y: number) => { x: number; y: number };
  windowToData: (x: number, y: number) => { x: number; y: number };
  width: number;
  height: number;
} {
  // Consider the x and y coordinates of all elements, which could be anywhere in the "infinite canvas",
  // Then transform to a rectangle (0,0) --> (width,height), along with a health margin.
  // Returns functions to transform back and forth.
  // Just be really dumb for the first version.

  let xmin = 0,
    ymin = 0,
    xmax = 0,
    ymax = 0;
  for (let { x, y } of elements) {
    if (x != null) {
      if (x < xmin) {
        xmin = x;
      }
      if (x > xmax) {
        xmax = x;
      }
      if (y < ymin) {
        ymin = y;
      }
      if (y > ymax) {
        ymax = y;
      }
    }
  }
  xmin -= margin;
  ymin -= margin;
  xmax += margin;
  ymax += margin;
  function dataToWindow(x, y) {
    return { x: x - xmin, y: y - ymin };
  }
  function windowToData(x, y) {
    return { x: x + xmin, y: y + ymin };
  }
  return {
    dataToWindow,
    windowToData,
    width: xmax - xmin,
    height: ymax - ymin,
  };
}
