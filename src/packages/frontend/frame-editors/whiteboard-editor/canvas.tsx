/*
Render the canvas, which is by definition all of the drawing elements
in the whiteboard.

This is NOT an HTML5 canvas.  It has nothing do with that.   We define
"the whiteboard" as everything -- the controls, settings, etc. -- and
the canvas as the area where the actual drawing appears.
*/
import { ReactNode, MutableRefObject, useEffect, useRef } from "react";
import { Element } from "./types";
import { Tool, TOOLS } from "./tools/spec";
import RenderElement from "./elements/render";
import Focused from "./focused";
import NotFocused from "./not-focused";
import Position from "./position";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import usePinchToZoom from "@cocalc/frontend/frame-editors/frame-tree/pinch-to-zoom";
import Grid from "./elements/grid";

import { Actions } from "./actions";
import { fontSizeToZoom, getPageSpan, getPosition } from "./math";

interface Props {
  elements: Element[];
  font_size?: number;
  focusedId?: string;
  selectedTool?: Tool;
  margin?: number;
  readOnly?: boolean;
  tool?: Tool;
  fitToScreen?: boolean; // if set, compute data then set font_size to get zoom (plus offset) to everything is visible properly on the page; also set fitToScreen back to false in frame tree data
  evtToDataRef?: MutableRefObject<Function | null>;
  noGrid?: boolean; // hide the grid
}

export default function Canvas({
  elements,
  font_size,
  focusedId,
  margin,
  readOnly,
  selectedTool,
  fitToScreen,
  evtToDataRef,
  noGrid,
}: Props) {
  margin = margin ?? 1000;

  const gridDivRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  usePinchToZoom({ target: canvasRef, min: 5, max: 100 });

  const innerCanvasRef = useRef<any>(null);
  const canvasScale = fontSizeToZoom(font_size);

  useEffect(() => {
    const { current } = canvasRef;
    if (current != null) {
      const scaledMargin = (margin ?? 0) * canvasScale;
      current.scrollTop = scaledMargin;
      current.scrollLeft = scaledMargin;
    }
  }, []);

  const frame = useFrameContext();
  const actions = frame.actions as Actions;

  useEffect(() => {
    if (fitToScreen) {
      actions.set_frame_tree({ id: frame.id, fitToScreen: false });
    }
  }, [fitToScreen]);

  const v: ReactNode[] = [];
  const transforms = getTransforms(elements, margin, canvasScale);

  for (const element of elements) {
    const { id, rotate } = element;
    const { x, y, z, w, h } = getPosition(element);
    if (x == null || y == null) continue; // invalid element!
    const t = transforms.dataToWindow(x, y, z);
    const focused = id == focusedId;
    let elt = <RenderElement element={element} focused={focused} />;
    if (element.style || focused) {
      elt = (
        <div
          style={{
            ...element.style,
            ...(focused
              ? {
                  cursor: "text",
                  border: "1px dashed grey",
                  marginLeft: "-1px",
                  marginTop: "-1px",
                }
              : undefined),
            width: "100%",
            height: "100%",
          }}
        >
          {elt}
        </div>
      );
    }
    if (rotate) {
      elt = (
        <div
          style={{
            transform: `rotate(${
              typeof rotate != "number" ? parseFloat(rotate) : rotate
            }rad)`,
            transformOrigin: "center",
            width: "100%",
            height: "100%",
          }}
        >
          {elt}
        </div>
      );
    }
    v.push(
      <Position key={id} x={t.x} y={t.y} z={t.z} w={w} h={h}>
        {focused ? (
          <Focused canvasScale={canvasScale} element={element}>
            {elt}
          </Focused>
        ) : (
          <NotFocused
            id={id}
            readOnly={readOnly}
            selectable={selectedTool == "select"}
          >
            {elt}
          </NotFocused>
        )}
      </Position>
    );
  }

  // convert mouse event to coordinates in data space
  function evtToData(e): { x: number; y: number } {
    const { clientX, clientY } = e;
    const c = canvasRef.current;
    if (c == null) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    if (rect == null) return { x: 0, y: 0 };
    // Coordinates inside the canvas div.
    const divX = c.scrollLeft + clientX - rect.left;
    const divY = c.scrollTop + clientY - rect.top;
    return transforms.windowToData(divX / canvasScale, divY / canvasScale);
  }
  if (evtToDataRef != null) {
    // share with outside world
    evtToDataRef.current = evtToData;
  }

  function handleClick(e) {
    if (!frame.isFocused) return;
    if (selectedTool == "select") {
      if (e.target == gridDivRef.current) {
        // clear selection
        // unfocus, because nothing got clicked on.
        actions.setFocusedElement(frame.id, "");
      } else {
        // clicked on an element on the canvas; either stay selected or let
        // it handle selecting it.
        return;
      }
    }
    const data = evtToData(e);

    // this code needs to move to tool panel spec stuff...
    if (
      selectedTool == "text" ||
      selectedTool == "note" ||
      selectedTool == "code"
    ) {
      const { id } = actions.createElement(
        {
          ...data,
          type: selectedTool,
          str: "",
        },
        true
      );
      actions.setSelectedTool(frame.id, "select");
      actions.setFocusedElement(frame.id, id);
    }
  }

  return (
    <div
      className={"smc-vfill"}
      ref={canvasRef}
      style={{ overflow: "scroll" }}
      onClick={!readOnly ? handleClick : undefined}
    >
      <div
        style={{
          transform: `scale(${canvasScale})`,
          transformOrigin: "top left",
          height: `calc(${canvasScale * 100}%)`,
        }}
      >
        <div
          ref={innerCanvasRef}
          style={{
            cursor:
              frame.isFocused && selectedTool
                ? TOOLS[selectedTool]?.cursor
                : "default",
            position: "relative",
          }}
        >
          {!noGrid && <Grid transforms={transforms} divRef={gridDivRef} />}
          {v}
        </div>
      </div>
    </div>
  );
}

function getTransforms(
  elements,
  margin,
  scale
): {
  dataToWindow: (
    x: number,
    y: number,
    z?: number
  ) => { x: number; y: number; z: number };
  windowToData: (
    x: number,
    y: number,
    z?: number
  ) => { x: number; y: number; z: number };
  width: number;
  height: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  zScale: number;
  scale: number;
} {
  /*
  Consider the x and y coordinates of all elements, which could be anywhere in the "infinite canvas",
  Then transform to a rectangle (0,0) --> (width,height), along with a health margin.
  Returns functions to transform back and forth.
  Just be really dumb for the first version.

  We also scale the zIndex z values of object to be in the closed
  interval [0,100], so we can confidently place UI elements, etc.
  */

  let { xMin, yMin, xMax, yMax, zMin, zMax } = getPageSpan(elements);
  xMin -= margin;
  yMin -= margin;
  xMax += margin;
  yMax += margin;

  const zScale: number = zMin == zMax ? 1 : 100 / (zMax - zMin);
  function dataToWindow(x, y, z?) {
    return {
      x: (x ?? 0) - xMin,
      y: (y ?? 0) - yMin,
      z: ((z ?? 0) - zMin) * zScale,
    };
  }
  function windowToData(x, y, z?) {
    return {
      x: (x ?? 0) + xMin,
      y: (y ?? 0) + yMin,
      z: (z ?? 0) / zScale + zMin,
    };
  }
  return {
    dataToWindow,
    windowToData,
    width: xMax - xMin,
    height: yMax - yMin,
    xMin,
    yMin,
    xMax,
    yMax,
    zMin,
    zMax,
    zScale,
    scale,
  };
}
