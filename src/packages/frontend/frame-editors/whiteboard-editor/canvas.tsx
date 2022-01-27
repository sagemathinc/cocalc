/*
Render the canvas, which is by definition all of the drawing elements
in the whiteboard.

This is NOT an HTML5 canvas.  It has nothing do with that.   We define
"the whiteboard" as everything -- the controls, settings, etc. -- and
the canvas as the area where the actual drawing appears.
*/
import {
  CSSProperties,
  ReactNode,
  MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Element, Point } from "./types";
import { Tool, TOOLS } from "./tools/spec";
import RenderElement from "./elements/render";
import Focused, { FOCUSED_BORDER_COLOR } from "./focused";
import NotFocused from "./not-focused";
import Position from "./position";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import usePinchToZoom from "@cocalc/frontend/frame-editors/frame-tree/pinch-to-zoom";
import Grid from "./elements/grid";

import { Actions } from "./actions";
import {
  fontSizeToZoom,
  getPageSpan,
  getPosition,
  pointEqual,
  pointRound,
  compressPath,
} from "./math";
import { throttle } from "lodash";
import Draggable from "react-draggable";
import { clearCanvas, drawCurve } from "./elements/pen";

interface Props {
  elements: Element[];
  font_size?: number;
  scale?: number; // use this if passed in; otherwise, deduce from font_size.
  focusedId?: string;
  selectedTool?: Tool;
  margin?: number;
  readOnly?: boolean;
  tool?: Tool;
  fitToScreen?: boolean; // if set, compute data then set font_size to get zoom (plus offset) to everything is visible properly on the page; also set fitToScreen back to false in frame tree data
  evtToDataRef?: MutableRefObject<Function | null>;
  isNavigator?: boolean; // is the navigator, so hide the grid, don't save window, don't scroll, don't move
}

export default function Canvas({
  elements,
  font_size,
  scale,
  focusedId,
  margin,
  readOnly,
  selectedTool,
  fitToScreen,
  evtToDataRef,
  isNavigator,
}: Props) {
  margin = margin ?? 1000;

  const gridDivRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  usePinchToZoom({ target: canvasRef, min: 5, max: 100, step: 2 });

  const navDrag = useRef<null | { x0: number; y0: number }>(null);
  const innerCanvasRef = useRef<any>(null);
  const canvasScale = scale ?? fontSizeToZoom(font_size);
  const transforms = getTransforms(elements, margin, canvasScale);
  const mousePath = useRef<{ x: number; y: number }[] | null>(null);
  const penCanvasRef = useRef<any>(null);

  // Whenever the scale changes, make sure the current center of the screen
  // is preserved.
  const [lastScale, setLastScale] = useState<number>(canvasScale);
  useEffect(() => {
    if (isNavigator) return;
    if (canvasScale == lastScale) return;
    const ctr = getCenterPosition();
    if (ctr == null) return;
    const { x, y } = ctr;
    const new_x = (lastScale / canvasScale) * x;
    const new_y = (lastScale / canvasScale) * y;
    const delta_x = x - new_x;
    const delta_y = y - new_y;
    const c = canvasRef.current;
    if (c == null) return;
    c.scrollLeft += delta_x;
    c.scrollTop += delta_y;
    setLastScale(canvasScale);
  }, [canvasScale]);

  useEffect(() => {
    const { current } = canvasRef;
    if (current != null) {
      const scaledMargin = (margin ?? 0) * canvasScale;
      current.scrollTop = scaledMargin;
      current.scrollLeft = scaledMargin;
    }
  }, []);

  useEffect(() => {
    updateVisibleWindow();
  }, [font_size, scale, transforms.width, transforms.height]);

  const frame = useFrameContext();
  const actions = frame.actions as Actions;

  // handle setting a center position for the visible window
  useEffect(() => {
    if (isNavigator) return;
    const ctr = frame.desc.get("visibleWindowCenter")?.toJS();
    if (ctr == null) return;
    setCenterPosition(ctr.x, ctr.y);
  }, [frame.desc.get("visibleWindowCenter")]);

  function getCenterPosition(): { x: number; y: number } | undefined {
    const c = canvasRef.current;
    if (c == null) return;
    const rect = c.getBoundingClientRect();
    if (rect == null) return;
    // the current center
    return {
      x: c.scrollLeft + rect.width / 2,
      y: c.scrollTop + rect.height / 2,
    };
  }

  function setCenterPosition(x: number, y: number) {
    const t = transforms.dataToWindow(x, y);
    t.x *= canvasScale;
    t.y *= canvasScale;
    const cur = getCenterPosition();
    if (cur == null) return;
    const delta_x = t.x - cur.x;
    const delta_y = t.y - cur.y;
    const c = canvasRef.current;
    if (c == null) return;
    c.scrollLeft += delta_x;
    c.scrollTop += delta_y;
  }

  useEffect(() => {
    if (fitToScreen) {
      actions.set_frame_tree({ id: frame.id, fitToScreen: false });
    }
  }, [fitToScreen]);

  function processElement(element, isNavRectangle = false) {
    const { id, rotate } = element;
    const { x, y, z, w, h } = getPosition(element);
    const t = transforms.dataToWindow(x, y, z);
    const focused = id == focusedId;
    let elt = (
      <RenderElement
        element={element}
        focused={focused}
        canvasScale={canvasScale}
      />
    );
    if (!isNavRectangle && (element.style || focused || isNavigator)) {
      elt = (
        <div
          style={{
            ...element.style,
            ...(focused
              ? {
                  cursor: "text",
                  border: `${2 / canvasScale}px dashed ${FOCUSED_BORDER_COLOR}`,
                  marginLeft: `-${2 / canvasScale}px`,
                  marginTop: `-${2 / canvasScale}px`,
                }
              : undefined),
            width: "100%",
            height: "100%",
            ...(isNavigator
              ? { background: "#9fc3ff", pointerEvents: "none" }
              : undefined),
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

    if (focused) {
      return (
        <Focused
          key={id}
          canvasScale={canvasScale}
          element={element}
          transforms={transforms}
        >
          {elt}
        </Focused>
      );
    } else {
      return (
        <Position
          key={id}
          x={t.x}
          y={t.y}
          z={isNavRectangle ? z : t.z}
          w={w}
          h={h}
        >
          <NotFocused
            id={id}
            readOnly={readOnly}
            selectable={selectedTool == "select"}
          >
            {elt}
          </NotFocused>
        </Position>
      );
    }
  }

  const v: ReactNode[] = [];

  for (const element of elements) {
    v.push(processElement(element));
  }

  if (isNavigator) {
    // The navigator rectangle
    const visible = frame.desc.get("visibleWindow")?.toJS();
    if (visible) {
      const { xMin, yMin, xMax, yMax } = visible;
      v.push(
        <Draggable
          key="nav"
          position={{ x: 0, y: 0 }}
          scale={canvasScale}
          onStart={(data) => {
            // dragging also causes a click and
            // the point of this is to prevent the click
            // centering the rectangle. Also, we need the delta.
            navDrag.current = { x0: data.clientX, y0: data.clientY };
          }}
          onStop={(data) => {
            if (!navDrag.current) return;
            const { x0, y0 } = navDrag.current;
            const visible = frame.desc.get("visibleWindow")?.toJS();
            if (visible == null) return;
            const ctr = {
              x: (visible.xMax + visible.xMin) / 2,
              y: (visible.yMax + visible.yMin) / 2,
            };
            const { x, y } = data;
            actions.setVisibleWindowCenter(frame.id, {
              x: ctr.x + (x - x0) / canvasScale,
              y: ctr.y + (y - y0) / canvasScale,
            });
          }}
        >
          <div>
            {processElement(
              {
                id: "nav-frame",
                x: xMin,
                y: yMin,
                w: xMax - xMin,
                h: yMax - yMin,
                z: 1000,
                type: "frame",
                data: { color: "black", thickness: 3 },
                style: { background: "lightgrey", opacity: 0.3 },
              },
              true
            )}
          </div>
        </Draggable>
      );
    }
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

  const updateVisibleWindow = isNavigator
    ? () => {}
    : useMemo(() => {
        return throttle(() => {
          const elt = canvasRef.current;
          if (!elt) return;
          // upper left corner of visible window
          const { scrollLeft, scrollTop } = elt;
          // width and height of visible window
          const { width, height } = elt.getBoundingClientRect();
          const { x: xMin, y: yMin } = transforms.windowToData(
            scrollLeft / canvasScale,
            scrollTop / canvasScale
          );
          const xMax = xMin + width / canvasScale;
          const yMax = yMin + height / canvasScale;
          actions.saveVisibleWindow(frame.id, { xMin, yMin, xMax, yMax });
        }, 50);
      }, [transforms, canvasScale]);

  return (
    <div
      className={"smc-vfill"}
      ref={canvasRef}
      style={{ overflow: isNavigator ? "hidden" : "scroll" }}
      onClick={(e) => {
        mousePath.current = null;
        if (isNavigator) {
          if (navDrag.current) {
            navDrag.current = null;
            return;
          }
          actions.setVisibleWindowCenter(frame.id, evtToData(e));
          return;
        }
        if (!readOnly) {
          handleClick(e);
        }
      }}
      onScroll={() => {
        updateVisibleWindow();
      }}
      onMouseDown={() => {
        if (selectedTool != "pen") return;
        mousePath.current = [];
      }}
      onMouseUp={() => {
        if (selectedTool != "pen") return;
        try {
          const canvas = penCanvasRef.current;
          if (canvas == null) return;
          const ctx = canvas.getContext("2d");
          if (ctx == null) return;
          clearCanvas({ ctx });
          if (mousePath.current == null || mousePath.current.length <= 1)
            return;
          function toData({ x, y }) {
            return pointRound(transforms.windowToData(x, y));
          }
          const { x, y } = toData(mousePath.current[0]);
          let xMin = x,
            xMax = x;
          let yMin = y,
            yMax = y;
          const path: Point[] = [{ x, y }];
          let lastPt = path[0];
          for (const pt of mousePath.current.slice(1)) {
            const thisPt = toData(pt);
            if (pointEqual(lastPt, thisPt)) continue;
            const { x, y } = thisPt;
            path.push({ x, y });
            if (x < xMin) xMin = x;
            if (x > xMax) xMax = x;
            if (y < yMin) yMin = y;
            if (y > yMax) yMax = y;
          }
          const margin = 2;
          xMin -= margin;
          xMax += margin;
          yMin -= margin;
          yMax += margin;
          for (const pt of path) {
            pt.x -= xMin;
            pt.y -= yMin;
          }

          const { id } = actions.createElement(
            {
              x: xMin,
              y: yMin,
              w: xMax - xMin,
              h: yMax - yMin,
              data: { path: compressPath(path) },
              type: "pen",
            },
            true
          );
        } finally {
          mousePath.current = null;
        }
      }}
      onMouseMove={(e) => {
        if (selectedTool == "pen" && mousePath.current != null) {
          const c = canvasRef.current;
          if (c == null) return;
          const rect = c.getBoundingClientRect();
          if (rect == null) return;
          const point = {
            x: (c.scrollLeft + e.clientX - rect.left) / canvasScale,
            y: (c.scrollTop + e.clientY - rect.top) / canvasScale,
          };
          mousePath.current.push(point);
          if (mousePath.current.length <= 1) return;
          const canvas = penCanvasRef.current;
          if (canvas == null) return;
          const ctx = canvas.getContext("2d");
          if (ctx == null) return;
          const c = canvasRef.current;
          if (c == null) return;
          drawCurve({
            ctx,
            path: mousePath.current,
            color: "black",
            radius: 1,
          });
        }
      }}
    >
      <div
        style={{
          transform: `scale(${canvasScale})`,
          transformOrigin: "top left",
          height: `calc(${canvasScale * 100}%)`,
        }}
      >
        {!isNavigator && selectedTool == "pen" && (
          <canvas
            ref={penCanvasRef}
            width={transforms.width}
            height={transforms.height}
            style={{
              cursor:
                frame.isFocused && selectedTool
                  ? TOOLS[selectedTool]?.cursor
                  : "default",
              position: "absolute",
              zIndex: 1001,
            }}
          />
        )}
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
          {!isNavigator && <Grid transforms={transforms} divRef={gridDivRef} />}
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

  let { xMin, yMin, xMax, yMax, zMin, zMax } = getPageSpan(elements, margin);

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
