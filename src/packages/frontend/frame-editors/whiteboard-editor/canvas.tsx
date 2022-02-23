/*
Render the canvas, which is by definition all of the drawing elements
in the whiteboard.

This is NOT an HTML5 canvas.  It has nothing do with that.   We define
"the whiteboard" as everything -- the controls, settings, etc. -- and
the canvas as the area where the actual drawing appears.

NOTE: This component assumes that when it is first mounted that elements
is actually what it will be for the initial load, so that it can properly
set the center position.  Do not create with elements=[], then the real
elements.

COORDINATES:

Functions below that depend on the coordinate system should
be named ending with either "Data", "Window" or "Viewport",
depending on what coordinates they use.  Those coordinate
systems are defined below.

data coordinates:
- what all the elements use in defining themselves.
- this is an x,y infinite plane, with of course the
  x-axis going down (computer graphics, after all)
- objects also have an arbitrary z coordinate

window coordinates:
- this is the div we're drawing everything to the screen using
- when we draw an element on the screen, we used position absolute
with window coordinates.
- also x,y with x-axis going down.  However, negative
  coordinates can never be visible.
- scrolling the visible window does not change these coordinates.
- this is related to data coordinates by a translation followed
  by scaling.
- we also translate all z-coordinates to be in an explicit interval [0,MAX]
  via an increasing (but not necessarily linear!) function.

viewport coordinates:
- this is the coordinate system used when clicking with the mouse
  and getting an event e.clientX, e.clientY.  The upper left point (0,0)
  is the upper left corner of the browser window.
- this is related to window coordinates by translation, where the parameters
  are the position of the canvas div and its scrollTop, scrollLeft attributes.
  Thus the transform back and forth between window and portal coordinates
  is extra tricky, because it can change any time at any time!
*/

import {
  ClipboardEvent,
  ReactNode,
  MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
  CSSProperties,
} from "react";
import { Element, ElementType, Point, Rect } from "./types";
import { Tool, TOOLS } from "./tools/spec";
import RenderElement from "./elements/render";
import Focused, {
  SELECTED_BORDER_COLOR,
  SELECTED_BORDER_TYPE,
  SELECTED_BORDER_WIDTH,
} from "./focused";
import NotFocused from "./not-focused";
import Position from "./position";
import { useFrameContext } from "./hooks";
import usePinchToZoom from "@cocalc/frontend/frame-editors/frame-tree/pinch-to-zoom";
import Grid from "./elements/grid";
import {
  centerOfRect,
  compressPath,
  fontSizeToZoom,
  ZOOM100,
  getPageSpan,
  getPosition,
  fitRectToRect,
  getOverlappingElements,
  getTransforms,
  pointEqual,
  pointRound,
  pointsToRect,
  rectEqual,
  rectSpan,
  MAX_ELEMENTS,
} from "./math";
import { throttle } from "lodash";
import Draggable from "react-draggable";
import { clearCanvas, drawCurve, getMaxCanvasSizeScale } from "./elements/pen";

import { getParams } from "./tools/tool-panel";

import { encodeForCopy, decodeForPaste } from "./tools/clipboard";
import { deleteElements } from "./tools/edit-bar";
import { aspectRatioToNumber } from "./tools/frame";

import Cursors from "./cursors";

const penDPIFactor = window.devicePixelRatio;

const MIDDLE_MOUSE_BUTTON = 1;

interface Props {
  elements: Element[];
  font_size?: number;
  scale?: number; // use this if passed in; otherwise, deduce from font_size.
  selection?: Set<string>;
  selectedTool?: Tool;
  margin?: number;
  readOnly?: boolean;
  tool?: Tool;
  evtToDataRef?: MutableRefObject<Function | null>;
  isNavigator?: boolean; // is the navigator, so hide the grid, don't save window, don't scroll, don't move
  style?: CSSProperties;
  previewMode?: boolean; // Use a blue box preview, instead of the actual elements.
  cursors?: { [id: string]: { [account_id: string]: any[] } };
}

export default function Canvas({
  elements,
  font_size,
  scale,
  selection,
  margin,
  readOnly,
  selectedTool,
  evtToDataRef,
  isNavigator,
  style,
  previewMode,
  cursors,
}: Props) {
  const frame = useFrameContext();
  const canvasScale = scale ?? fontSizeToZoom(font_size);
  // We have to scale the margin as we zoom in and out,
  // since otherwise it will look way too small. We don't
  // touch margin though if it is explicitly set.
  margin = margin ?? 1500 / canvasScale;

  const gridDivRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  usePinchToZoom({ target: canvasRef, min: 5, max: 100, step: 2 });

  const navDrag = useRef<null | { x0: number; y0: number }>(null);
  const innerCanvasRef = useRef<any>(null);

  const canvasScaleRef = useRef<number>(1);
  const transforms = useMemo(() => {
    const t = getTransforms(elements, margin, canvasScale);
    // also update the canvas scale, which is needed to keep
    // the canvas preview layer (for the pen) from getting too big
    // and wasting memory.
    canvasScaleRef.current = getMaxCanvasSizeScale(
      penDPIFactor * t.width,
      penDPIFactor * t.height
    );
    return t;
  }, [elements, margin, canvasScale]);

  const mousePath = useRef<{ x: number; y: number }[] | null>(null);
  const handRef = useRef<{
    scrollLeft: number;
    scrollTop: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const ignoreNextClick = useRef<boolean>(false);
  // position of mouse right now not transformed in any way,
  // just in case we need it. This is clientX, clientY off
  // of the canvas div.
  const mousePos = useRef<{ clientX: number; clientY: number } | null>(null);

  // this is in terms of window coords:
  const [selectRect, setSelectRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const penCanvasRef = useRef<any>(null);

  // Whenever the data <--> window transform params change,
  // ensure the current center of the viewport is preserved,
  // to avoid major disorientation for the user.
  const lastViewport = useRef<Rect | undefined>(undefined);
  useEffect(() => {
    if (isNavigator) return;
    const viewport = getViewportData();
    if (lastViewport.current != null && viewport != null) {
      const last = centerOfRect(lastViewport.current);
      const cur = centerOfRect(viewport);
      const tx = last.x - cur.x;
      const ty = last.y - cur.y;
      const c = canvasRef.current;
      if (c == null) return;
      c.scrollLeft += tx * canvasScale;
      c.scrollTop += ty * canvasScale;
    }
    lastViewport.current = viewport;
  }, [
    canvasScale,
    transforms.xMin,
    transforms.xMax,
    transforms.yMin,
    transforms.yMax,
  ]);

  // If the viewport changes, but not because we just set it,
  // then we move our current center displayed viewport to match that.
  // This happens, e.g., when the navmap is clicked on or dragged.
  useEffect(() => {
    if (isNavigator) return;
    const viewport = frame.desc.get("viewport")?.toJS();
    if (viewport == null || rectEqual(viewport, lastViewport.current)) {
      return;
    }
    // request to change viewport.
    setCenterPositionData(centerOfRect(viewport));
  }, [frame.desc.get("viewport")]);

  // Save state about the viewport so it can be displayed
  // in the navmap, and also restored later.
  useEffect(() => {
    saveViewport();
  }, [
    canvasScale,
    transforms.xMin,
    transforms.xMax,
    transforms.yMin,
    transforms.yMax,
  ]);

  // Handle setting a center position for the visible window
  // by restoring last known viewport center on first mount.
  // The center is nice since it is meaningful even if browser
  // viewport has changed (e.g., font size, window size, etc.)
  useEffect(() => {
    if (isNavigator) return;
    const viewport = frame.desc.get("viewport")?.toJS();
    if (viewport == null) {
      // document was never opened before in this browser,
      // so fit to screen.
      frame.actions.fitToScreen(frame.id, true);
      return;
    }
    const center = centerOfRect(viewport);
    if (center != null) {
      setCenterPositionData(center);
    }
  }, []);

  function getToolParams(tool) {
    return getParams(tool, frame.desc.get(`${tool}Id`));
  }

  // get window coordinates of what is currently displayed in the exact
  // center of the viewport.
  function getCenterPositionWindow(): { x: number; y: number } | undefined {
    const c = canvasRef.current;
    if (c == null) return;
    const rect = c.getBoundingClientRect();
    if (rect == null) return;
    // the current center of the viewport, but in window coordinates, i.e.,
    // absolute coordinates into the canvas div.
    return {
      x: c.scrollLeft + rect.width / 2,
      y: c.scrollTop + rect.height / 2,
    };
  }

  // set center position in Data coordinates.
  function setCenterPositionData({ x, y }: Point): void {
    const t = dataToWindow({ x, y });
    const cur = getCenterPositionWindow();
    if (cur == null) return;
    const delta_x = t.x - cur.x;
    const delta_y = t.y - cur.y;
    const c = canvasRef.current;
    if (c == null) return;
    const scrollLeftGoal = Math.floor(c.scrollLeft + delta_x);
    const scrollTopGoal = Math.floor(c.scrollTop + delta_y);
    c.scrollLeft = scrollLeftGoal;
    c.scrollTop = scrollTopGoal;
  }

  // when fitToScreen is true, compute data then set font_size to
  // get zoom (plus offset) to everything is visible properly
  // on the page; also set fitToScreen back to false in
  // frame tree data.
  useEffect(() => {
    if (isNavigator || !frame.desc.get("fitToScreen")) return;
    try {
      if (elements.length == 0) {
        // Special case -- the screen is blank; don't want to just
        // maximal zoom in on the center!
        setCenterPositionData({ x: 0, y: 0 });
        lastViewport.current = getViewportData();
        frame.actions.set_font_size(frame.id, Math.floor(ZOOM100));
        return;
      }
      const viewport = getViewportData();
      if (viewport == null) return;
      const rect = rectSpan(elements);
      const offset = 50 / canvasScale; // a little breathing room for the toolbar
      setCenterPositionData({
        x: rect.x + rect.w / 2 - offset,
        y: rect.y + rect.h / 2,
      });
      const { scale } = fitRectToRect(rect, viewport);
      if (scale != 1) {
        // ensure lastViewport is up to date before zooming.
        lastViewport.current = getViewportData();
        frame.actions.set_font_size(
          frame.id,
          Math.floor((font_size ?? ZOOM100) * scale)
        );
      }
    } finally {
      frame.actions.fitToScreen(frame.id, false);
    }
  }, [frame.desc.get("fitToScreen")]);

  function processElement(element, isNavRectangle = false) {
    const { id, rotate } = element;
    const { x, y, z, w, h } = getPosition(element);
    const t = transforms.dataToWindowNoScale(x, y, z);

    if (previewMode && !isNavRectangle) {
      // This just shows blue boxes in the nav map, instead of actually
      // rendering something. It's probably faster and easier,
      // but really rendering something is much more usable.
      return (
        <Position key={id} x={t.x} y={t.y} z={0} w={w} h={h}>
          <div
            style={{
              width: "100%",
              height: "100%",
              opacity: "0.8",
              background: "#9fc3ff",
              pointerEvents: "none",
              touchAction: "none",
            }}
          ></div>
        </Position>
      );
    }

    const selected = selection?.has(id);
    const focused = !!(selected && selection?.size === 1);
    let elt = (
      <RenderElement
        element={element}
        focused={focused}
        canvasScale={canvasScale}
        readOnly={readOnly || isNavigator}
        cursors={cursors?.[id]}
      />
    );
    if (!isNavRectangle && (element.style || selected || isNavigator)) {
      elt = (
        <div
          style={{
            ...element.style,
            ...(selected
              ? {
                  cursor: "text",
                  border: `${
                    SELECTED_BORDER_WIDTH / canvasScale
                  }px ${SELECTED_BORDER_TYPE} ${SELECTED_BORDER_COLOR}`,
                  marginLeft: `-${SELECTED_BORDER_WIDTH / canvasScale}px`,
                  marginTop: `-${SELECTED_BORDER_WIDTH / canvasScale}px`,
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

    if (focused) {
      return (
        <Focused
          key={id}
          canvasScale={canvasScale}
          element={element}
          allElements={elements}
          selectedElements={[element]}
          transforms={transforms}
          readOnly={readOnly}
          cursors={cursors?.[id]}
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
          <Cursors cursors={cursors?.[id]} canvasScale={canvasScale} />
          <NotFocused id={id} selectable={selectedTool == "select"}>
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

  if (selection != null && selection.size > 1) {
    // create a virtual selection element that
    // contains the region spanned by all elements
    // in the selection.
    // TODO: This could be optimized with better data structures...
    const selectedElements = elements.filter((element) =>
      selection.has(element.id)
    );
    const { xMin, yMin, xMax, yMax } = getPageSpan(selectedElements, 0);
    const element = {
      type: "selection" as ElementType,
      id: "selection",
      x: xMin,
      y: yMin,
      w: xMax - xMin + 1,
      h: yMax - yMin + 1,
      z: 0,
    };
    v.push(
      <Focused
        key={"selection"}
        canvasScale={canvasScale}
        element={element}
        allElements={elements}
        selectedElements={selectedElements}
        transforms={transforms}
        readOnly={readOnly}
      >
        <RenderElement element={element} canvasScale={canvasScale} focused />
      </Focused>
    );
  }

  if (isNavigator) {
    // The navigator rectangle
    const visible = frame.desc.get("viewport")?.toJS();
    if (visible) {
      v.unshift(
        <Draggable
          key="nav"
          position={{ x: 0, y: 0 }}
          scale={canvasScale}
          onStart={(evt: MouseEvent) => {
            // dragging also causes a click and
            // the point of this is to prevent the click
            // centering the rectangle. Also, we need the delta.
            navDrag.current = { x0: evt.clientX, y0: evt.clientY };
          }}
          onStop={(evt: MouseEvent) => {
            if (!navDrag.current) return;
            const { x0, y0 } = navDrag.current;
            const visible = frame.desc.get("viewport")?.toJS();
            if (visible == null) return;
            const ctr = centerOfRect(visible);
            const { x, y } = evt;
            frame.actions.setViewportCenter(frame.id, {
              x: ctr.x + (x - x0) / canvasScale,
              y: ctr.y + (y - y0) / canvasScale,
            });
          }}
        >
          <div style={{ zIndex: MAX_ELEMENTS + 1, position: "absolute" }}>
            {processElement(
              {
                id: "nav-frame",
                ...visible,
                z: MAX_ELEMENTS + 1,
                type: "frame",
                data: { color: "#888", radius: 0.5 },
                style: {
                  background: "rgb(200,200,200,0.2)",
                },
              },
              true
            )}
          </div>
        </Draggable>
      );
    }
  }

  /****************************************************/
  // Full coordinate transforms back and forth!
  // Note, transforms has coordinate transforms without scaling
  // in it, since that's very useful. However, these two
  // below are the full transforms.

  function viewportToWindow({ x, y }: Point): Point {
    const c = canvasRef.current;
    if (c == null) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    if (rect == null) return { x: 0, y: 0 };
    return {
      x: c.scrollLeft + x - rect.left,
      y: c.scrollTop + y - rect.top,
    };
  }

  // window coords to data coords
  function windowToData({ x, y }: Point): Point {
    return transforms.windowToDataNoScale(x / canvasScale, y / canvasScale);
  }
  function dataToWindow({ x, y }: Point): Point {
    const p = transforms.dataToWindowNoScale(x, y);
    p.x *= canvasScale;
    p.y *= canvasScale;
    return { x: p.x, y: p.y };
  }
  /****************************************************/
  // The viewport in *data* coordinates
  function getViewportData(): Rect | undefined {
    const v = getViewportWindow();
    if (v == null) return;
    const { x, y } = windowToData(v);
    return { x, y, w: v.w / canvasScale, h: v.h / canvasScale };
  }
  // The viewport in *window* coordinates
  function getViewportWindow(): Rect | undefined {
    const c = canvasRef.current;
    if (c == null) return;
    const { width: w, height: h } = c.getBoundingClientRect();
    return { x: c.scrollLeft, y: c.scrollTop, w, h };
  }

  // convert mouse event to coordinates in data space
  function evtToData(e): Point {
    const { clientX: x, clientY: y } = e;
    return windowToData(viewportToWindow({ x, y }));
  }
  if (evtToDataRef != null) {
    // share with outside world
    evtToDataRef.current = evtToData;
  }

  function handleClick(e) {
    if (!frame.isFocused) return;
    if (ignoreNextClick.current) {
      ignoreNextClick.current = false;
      return;
    }
    if (selectedTool == "hand") return;
    if (selectedTool == "select") {
      if (e.target == gridDivRef.current) {
        // clear selection
        frame.actions.clearSelection(frame.id);
        const edgeStart = frame.desc.get("edgeStart");
        if (edgeStart) {
          frame.actions.clearEdgeCreateStart(frame.id);
        }
      } else {
        // clicked on an element on the canvas; either stay selected or let
        // it handle selecting itself.
      }
      return;
    }
    const data: Partial<Element> = { ...evtToData(e), z: transforms.zMax + 1 };
    let params: any = undefined;

    // TODO -- move some of this to the spec?
    if (selectedTool == "note") {
      params = { data: getToolParams("note") };
    } else if (selectedTool == "timer") {
      params = { data: getToolParams("timer") };
    } else if (selectedTool == "icon") {
      params = { data: getToolParams("icon") };
    } else if (selectedTool == "text") {
      params = { data: getToolParams("text") };
    } else if (selectedTool == "frame") {
      params = { data: getToolParams("frame") };
      if (params.data.aspectRatio) {
        const ar = aspectRatioToNumber(params.data.aspectRatio);
        data.w = 500;
        data.h = data.w / (ar != 0 ? ar : 1);
      }
    } else if (selectedTool == "chat") {
      data.w = 375;
      data.h = 450;
    }

    const element = {
      ...data,
      type: selectedTool,
      ...params,
    };

    // create element
    const { id } = frame.actions.createElement(element, true);

    // in some cases, select it
    if (
      selectedTool == "text" ||
      selectedTool == "note" ||
      selectedTool == "code" ||
      selectedTool == "timer" ||
      selectedTool == "chat" ||
      selectedTool == "frame"
    ) {
      frame.actions.setSelectedTool(frame.id, "select");
      frame.actions.setSelection(frame.id, id);
    }
  }

  const saveViewport = isNavigator
    ? () => {}
    : useMemo(() => {
        return throttle(() => {
          const viewport = getViewportData();
          if (viewport) {
            lastViewport.current = viewport;
            frame.actions.saveViewport(frame.id, viewport);
          }
        }, 50);
      }, [
        canvasScale,
        transforms.xMin,
        transforms.xMax,
        transforms.yMin,
        transforms.yMax,
      ]);

  const onMouseDown = (e) => {
    if (selectedTool == "hand" || e.button == MIDDLE_MOUSE_BUTTON) {
      const c = canvasRef.current;
      if (c == null) return;
      handRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        scrollLeft: c.scrollLeft,
        scrollTop: c.scrollTop,
      };
      return;
    }
    if (selectedTool == "select" || selectedTool == "frame") {
      if (e.target != gridDivRef.current) return;
      // draw a rectangular to select multiple items
      const point = getMousePos(e);
      if (point == null) return;
      mousePath.current = [point];
      return;
    }
    if (selectedTool == "pen") {
      const point = getMousePos(e);
      if (point == null) return;
      mousePath.current = [point];
      ignoreNextClick.current = true;
      return;
    }
  };

  const onTouchStart = (e) => {
    if (!isNavigator && selectedTool == "hand") {
      // touch already does hand by default
      return;
    }
    onMouseDown(e.touches[0]);
    // This is needed for all touch events when drawing, since otherwise the
    // entire page gets selected randomly when doing things.
    if (selectedTool == "pen") {
      e.preventDefault();
    }
  };

  const onMouseUp = (e) => {
    if (handRef.current != null) {
      handRef.current = null;
      return;
    }
    setSelectRect(null);
    if (mousePath.current == null) return;
    try {
      if (selectedTool == "select" || selectedTool == "frame") {
        if (mousePath.current.length < 2) return;
        setSelectRect(null);
        ignoreNextClick.current = true;
        if (e != null && !(e.altKey || e.metaKey || e.ctrlKey || e.shiftKey)) {
          frame.actions.clearSelection(frame.id);
        }
        const p0 = mousePath.current[0];
        const p1 = mousePath.current[1];
        const rect = pointsToRect(
          transforms.windowToDataNoScale(p0.x, p0.y),
          transforms.windowToDataNoScale(p1.x, p1.y)
        );
        if (selectedTool == "frame") {
          // make a frame at the selection.  Note that we put
          // it UNDER everything.
          const data = getToolParams("frame");
          if (data.aspectRatio) {
            const ar = aspectRatioToNumber(data.aspectRatio);
            if (ar != 0) {
              rect.h = rect.w / ar;
            }
          }

          const { id } = frame.actions.createElement(
            { type: "frame", ...rect, z: transforms.zMin - 1, data },
            true
          );
          frame.actions.setSelectedTool(frame.id, "select");
          frame.actions.setSelection(frame.id, id);
        } else {
          // select everything in selection
          const overlapping = getOverlappingElements(elements, rect);
          const ids = overlapping.map((element) => element.id);
          frame.actions.setSelectionMulti(frame.id, ids, "add");
        }
        return;
      } else if (selectedTool == "pen") {
        const canvas = penCanvasRef.current;
        if (canvas == null) return;
        const ctx = canvas.getContext("2d");
        if (ctx == null) return;
        clearCanvas({ ctx });
        if (mousePath.current == null || mousePath.current.length <= 1) {
          return;
        }
        ignoreNextClick.current = true;
        const toData = ({ x, y }) =>
          pointRound(transforms.windowToDataNoScale(x, y));
        const { x, y } = toData(mousePath.current[0]);
        let xMin = x,
          xMax = x;
        let yMin = y,
          yMax = y;
        const path: Point[] = [{ x, y }];
        let lastPt = path[0];
        for (const pt of mousePath.current.slice(1)) {
          const thisPt = toData(pt);
          if (pointEqual(lastPt, thisPt)) {
            lastPt = thisPt;
            continue;
          }
          lastPt = thisPt;
          const { x, y } = thisPt;
          path.push({ x, y });
          if (x < xMin) xMin = x;
          if (x > xMax) xMax = x;
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
        if (path.length <= 1) return;

        for (const pt of path) {
          pt.x = pt.x - xMin;
          pt.y = pt.y - yMin;
        }

        frame.actions.createElement(
          {
            x: xMin,
            y: yMin,
            z: transforms.zMax + 1,
            w: xMax - xMin + 1,
            h: yMax - yMin + 1,
            data: { path: compressPath(path), ...getToolParams("pen") },
            type: "pen",
          },
          true
        );

        return;
      }
    } finally {
      mousePath.current = null;
    }
  };

  const onTouchEnd = (e) => {
    if (!isNavigator && selectedTool == "hand") return;
    onMouseUp(e);
    if (selectedTool == "pen") {
      e.preventDefault();
    }
  };

  const onTouchCancel = (e) => {
    if (selectedTool == "pen") {
      e.preventDefault();
    }
  };

  // convert from clientX,clientY to unscaled window coordinates,
  function getMousePos(
    e: {
      clientX: number;
      clientY: number;
    } | null
  ): { x: number; y: number } | undefined {
    if (e == null) return;
    const c = canvasRef.current;
    if (c == null) return;
    const rect = c.getBoundingClientRect();
    if (rect == null) return;
    return {
      x: (c.scrollLeft + e.clientX - rect.left) / canvasScale,
      y: (c.scrollTop + e.clientY - rect.top) / canvasScale,
    };
  }

  const onMouseMove = (e, touch = false) => {
    if (!touch && !e.buttons) {
      // mouse button no longer down - cancel any capture.
      // This can happen with no mouseup, due to mouseup outside
      // of the div, i.e., drag off the edge.
      onMouseUp(e);
      return;
    }
    if (handRef.current != null) {
      // dragging with hand tool
      const c = canvasRef.current;
      if (c == null) return;
      const { clientX, clientY, scrollLeft, scrollTop } = handRef.current;
      const deltaX = e.clientX - clientX;
      const deltaY = e.clientY - clientY;
      c.scrollTop = scrollTop - deltaY;
      c.scrollLeft = scrollLeft - deltaX;
      return;
    }
    if (mousePath.current == null) return;
    e.preventDefault?.(); // only makes sense for mouse not touch.
    if (selectedTool == "select" || selectedTool == "frame") {
      const point = getMousePos(e);
      if (point == null) return;
      mousePath.current[1] = point;
      setSelectRect(pointsToRect(mousePath.current[0], mousePath.current[1]));
      return;
    }
    if (selectedTool == "pen") {
      const point = getMousePos(e);
      if (point == null) return;
      mousePath.current.push(point);
      if (mousePath.current.length <= 1) return;
      const canvas = penCanvasRef.current;
      if (canvas == null) return;
      const ctx = canvas.getContext("2d");
      if (ctx == null) return;
      /*
      NOTE/TODO: we are again scaling/redrawing the *entire* curve every time
      we get new mouse move.  Curves are pretty small, and the canvas is limited
      in size, so this is actually working and feels fast on devices I've tried.
      But it would obviously be better to draw only what is new properly.
      That said, do that with CARE because I did have one implementation of that
      and so many lines were drawn on top of each other that highlighting
      didn't look transparent during the preview.

      The second bad thing about this is that the canvas is covering the entire
      current span of all elements.  Thus as that gets large, the resolution of
      the preview goes down further. It would be better to use a canvas that is
      just over the visible viewport.

      So what we have works fine now, but there's a lot of straightforward but
      tedious room for improvement to make the preview look perfect as you draw.
      */
      clearCanvas({ ctx });
      ctx.restore();
      ctx.save();
      ctx.scale(penDPIFactor, penDPIFactor);
      const path: Point[] = [];
      for (const point of mousePath.current) {
        path.push({
          x: point.x * canvasScaleRef.current,
          y: point.y * canvasScaleRef.current,
        });
      }
      const { color, radius, opacity } = getToolParams("pen");
      drawCurve({
        ctx,
        path,
        color,
        radius: canvasScaleRef.current * radius,
        opacity,
      });
      return;
    }
  };

  const onTouchMove = (e) => {
    if (!isNavigator && selectedTool == "hand") return;
    onMouseMove(e.touches[0], true);
    if (selectedTool == "pen") {
      e.preventDefault();
    }
  };

  return (
    <div
      className={"smc-vfill"}
      ref={canvasRef}
      style={{
        overflow: isNavigator ? "hidden" : "scroll",
        touchAction: ["select", "pen", "frame"].includes(selectedTool)
          ? "none"
          : undefined,
        userSelect: "none",
        ...style,
      }}
      onClick={(evt) => {
        mousePath.current = null;
        if (isNavigator) {
          if (navDrag.current) {
            navDrag.current = null;
            return;
          }
          frame.actions.setViewportCenter(frame.id, evtToData(evt));
          return;
        }
        if (!readOnly) {
          handleClick(evt);
        }
      }}
      onScroll={() => {
        saveViewport();
      }}
      onMouseDown={!isNavigator ? onMouseDown : undefined}
      onMouseMove={!isNavigator ? onMouseMove : undefined}
      onMouseUp={!isNavigator ? onMouseUp : undefined}
      onTouchStart={!isNavigator ? onTouchStart : undefined}
      onTouchMove={!isNavigator ? onTouchMove : undefined}
      onTouchEnd={!isNavigator ? onTouchEnd : undefined}
      onTouchCancel={!isNavigator ? onTouchCancel : undefined}
      onCopy={
        !isNavigator
          ? (event: ClipboardEvent<HTMLDivElement>) => {
              event.preventDefault();
              const selectedElements = getSelectedElements({
                elements,
                selection,
              });
              const encoded = encodeForCopy(selectedElements);
              event.clipboardData.setData(
                "application/x-cocalc-whiteboard",
                encoded
              );
            }
          : undefined
      }
      onCut={
        isNavigator || readOnly
          ? undefined
          : (event: ClipboardEvent<HTMLDivElement>) => {
              event.preventDefault();
              const selectedElements = getSelectedElements({
                elements,
                selection,
              });
              const encoded = encodeForCopy(selectedElements);
              event.clipboardData.setData(
                "application/x-cocalc-whiteboard",
                encoded
              );
              deleteElements(frame.actions, selectedElements);
            }
      }
      onPaste={
        isNavigator || readOnly
          ? undefined
          : (event: ClipboardEvent<HTMLDivElement>) => {
              const encoded = event.clipboardData.getData(
                "application/x-cocalc-whiteboard"
              );
              if (encoded) {
                // copy/paste between whiteboards of their own structued data
                const pastedElements = decodeForPaste(encoded);
                /* TODO: should also get where mouse is? */
                let target: Point | undefined = undefined;
                const pos = getMousePos(mousePos.current);
                if (pos != null) {
                  const { x, y } = pos;
                  target = transforms.windowToDataNoScale(x, y);
                } else {
                  const point = getCenterPositionWindow();
                  if (point != null) {
                    target = windowToData(point);
                  }
                }

                const ids = frame.actions.insertElements(
                  pastedElements,
                  target
                );
                frame.actions.setSelectionMulti(frame.id, ids);
              } else {
                // nothing else implemented yet!
              }
            }
      }
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
            width={canvasScaleRef.current * penDPIFactor * transforms.width}
            height={canvasScaleRef.current * penDPIFactor * transforms.height}
            style={{
              width: `${transforms.width}px`,
              height: `${transforms.height}px`,
              cursor: TOOLS[selectedTool]?.cursor,
              position: "absolute",
              zIndex: MAX_ELEMENTS + 1,
              top: 0,
              left: 0,
            }}
          />
        )}
        {selectRect != null && (
          <div
            style={{
              position: "absolute",
              left: `${selectRect.x}px`,
              top: `${selectRect.y}px`,
              width: `${selectRect.w}px`,
              height: `${selectRect.h}px`,
              border: `${
                SELECTED_BORDER_WIDTH / canvasScale
              }px solid ${SELECTED_BORDER_COLOR}`,
              zIndex: MAX_ELEMENTS + 100,
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "blue",
                opacity: 0.1,
              }}
            ></div>
          </div>
        )}
        <div
          ref={innerCanvasRef}
          style={{
            cursor:
              frame.isFocused && selectedTool
                ? selectedTool == "hand" && handRef.current
                  ? "grabbing"
                  : TOOLS[selectedTool]?.cursor
                : undefined,
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

function getSelectedElements({
  elements,
  selection,
}: {
  elements: Element[];
  selection?: Set<string>;
}): Element[] {
  if (!selection) return [];
  return elements.filter((element) => selection.has(element.id));
}
