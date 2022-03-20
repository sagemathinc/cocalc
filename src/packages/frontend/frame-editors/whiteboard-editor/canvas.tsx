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
  are the position of the canvas div and its top,left offset attributes.
  Thus the transform back and forth between window and viewport coordinates
  is extra tricky, because it can change any time at any time!
*/

import { useWheel } from "@use-gesture/react";
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
import { Element, ElementType, ElementsMap, Point, Rect } from "./types";
import { Tool, TOOLS } from "./tools/spec";
import RenderElement from "./elements/render";
import RenderEdge from "./elements/edge";
import Focused from "./focused";
import {
  EDIT_BORDER_COLOR,
  SELECTED_BORDER_COLOR,
  SELECTED_PADDING,
  SELECTED_BORDER_TYPE,
  SELECTED_BORDER_WIDTH,
} from "./elements/style";
import NotFocused from "./not-focused";
import Position from "./position";
import { useFrameContext } from "./hooks";
import usePinchToZoom from "@cocalc/frontend/frame-editors/frame-tree/pinch-to-zoom";
import useResizeObserver from "use-resize-observer";
import Grid from "./elements/grid";
import {
  centerOfRect,
  compressPath,
  zoomToFontSize,
  fontSizeToZoom,
  getPageSpan,
  getPosition,
  fitRectToRect,
  getOverlappingElements,
  getTransforms,
  Transforms,
  pointEqual,
  pointRound,
  pointsToRect,
  rectEqual,
  rectSpan,
  MAX_ELEMENTS,
} from "./math";
import {
  MIN_ZOOM,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
} from "./tools/defaults";
import { throttle } from "lodash";
import Draggable from "react-draggable";
import { clearCanvas, drawCurve, getMaxCanvasSizeScale } from "./elements/pen";
import { getElement } from "./tools/tool-panel";
import { encodeForCopy, decodeForPaste } from "./tools/clipboard";
import { aspectRatioToNumber } from "./tools/frame";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { extendToIncludeEdges } from "./actions";

import Cursors from "./cursors";

const penDPIFactor = window.devicePixelRatio;

const MIDDLE_MOUSE_BUTTON = 1;

interface Props {
  elements: Element[];
  elementsMap?: ElementsMap;
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
  elementsMap,
  font_size,
  scale: scale0,
  selection,
  margin = 10000,
  readOnly,
  selectedTool,
  evtToDataRef,
  isNavigator,
  style,
  previewMode,
  cursors,
}: Props) {
  const isMountedRef = useIsMountedRef();
  const frame = useFrameContext();
  const editFocus = frame.desc.get("editFocus");
  const canvasScale = scale0 ?? fontSizeToZoom(font_size);

  const gridDivRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const scaleDivRef = useRef<any>(null);

  const firstOffsetRef = useRef<any>({
    scale: 1,
    offset: { x: 0, y: 0 },
    mouse: { x: 0, y: 0 },
  });

  const lastPinchRef = useRef<number>(0);
  const isZoomingRef = usePinchToZoom({
    disabled: isNavigator,
    target: canvasRef,
    min: MIN_FONT_SIZE,
    max: MAX_FONT_SIZE,
    throttleMs: 100,
    getFontSize: () => font_size ?? DEFAULT_FONT_SIZE,
    onZoom: ({ fontSize, first }) => {
      lastPinchRef.current = new Date().valueOf();
      if (first) {
        const rect = scaleDivRef.current?.getBoundingClientRect();
        const mouse =
          rect != null && mousePosRef.current
            ? {
                x: mousePosRef.current.clientX - rect.left,
                y: mousePosRef.current.clientY - rect.top,
              }
            : { x: 0, y: 0 };
        firstOffsetRef.current = {
          offset: offset.get(),
          scale: scale.get(),
          mouse,
        };
      }

      const curScale = fontSizeToZoom(fontSize);
      scale.set(curScale);

      const { mouse } = firstOffsetRef.current;
      const tx = (mouse.x * curScale) / firstOffsetRef.current.scale - mouse.x;
      const ty = (mouse.y * curScale) / firstOffsetRef.current.scale - mouse.y;
      const x = firstOffsetRef.current.offset.x - tx;
      const y = firstOffsetRef.current.offset.y - ty;
      offset.set({ x, y });
      scale.setFontSize();
    },
  });

  useEffect(() => {
    if (isNavigator) return;
    saveViewport();
  }, [canvasScale]);

  const scaleRef = useRef<number>(canvasScale);
  const scale = useMemo(() => {
    return {
      set: (scale: number) => {
        if (scaleDivRef.current == null) return;
        scaleRef.current = scale;
        scaleDivRef.current.style.setProperty("transform", `scale(${scale})`);
      },
      get: () => {
        return scaleRef.current;
      },
      setFontSize: throttle(() => {
        frame.actions.set_font_size(frame.id, zoomToFontSize(scaleRef.current));
      }, 250),
    };
  }, [scaleRef, scaleDivRef, frame.id]);

  const offsetRef = useRef<{ left: number; top: number }>({ left: 0, top: 0 });
  const offset = useMemo(() => {
    const set = ({ x, y }: Point) => {
      if (isNavigator) return;
      const e = scaleDivRef.current;
      const c = canvasRef.current;
      const rect = c?.getBoundingClientRect();
      let left, top;
      if (e != null && rect?.width) {
        // ensure values are in valid range, if possible.
        left = Math.min(
          0,
          Math.max(x, -e.offsetWidth * scaleRef.current + rect.width)
        );
        top = Math.min(
          0,
          Math.max(y, -e.offsetHeight * scaleRef.current + rect.height)
        );
      } else {
        // don't bother with ensuring values in valid range; this happens,
        // e.g., when remounting right as the editor is being shown again.
        // If we don't do this, left/top get temporarily messed up if you page
        // away to files, then to list of all projects, then back to files,
        // then back to the editor.
        left = x;
        top = y;
      }

      offsetRef.current = { left, top };
      e.style.setProperty("left", `${left}px`);
      e.style.setProperty("top", `${top}px`);
      saveViewport();
    };

    return {
      set,
      get: () => {
        return { x: offsetRef.current.left, y: offsetRef.current.top };
      },
      translate: ({ x, y }: Point) => {
        const { left, top } = offsetRef.current;
        set({ x: -x + left, y: -y + top });
      },
    };
  }, [scaleDivRef, canvasRef, offsetRef]);

  // This has to happen directly here, and now as part of
  // a useEffect, since it sets offsetRef, which is used
  // for the offset in rendering the scaling div as a
  // result of canvasScale having changed.  If this is done
  // as part of a useEffect, you get a big flicker and random failure.
  if (
    !isNavigator &&
    scaleRef.current != canvasScale &&
    new Date().valueOf() >= lastPinchRef.current + 500
  ) {
    // - canvasScale changed due to something external, rather than
    // usePinchToZoom above, since when changing due to pinch zoom,
    // scaleRef has already been set before this call here happens.
    // - We want to preserve the center of the canvas on zooming.
    // - Code below is almost identical to usePinch code above,
    //   except we compute clientX and clientY that would get if mouse
    //   was in the center.
    const rect = scaleDivRef.current?.getBoundingClientRect();
    if (rect != null) {
      const rect2 = canvasRef.current?.getBoundingClientRect();
      const clientX = rect2.left + rect2.width / 2;
      const clientY = rect2.top + rect2.height / 2;
      const center = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
      const tx = (center.x * canvasScale) / scaleRef.current - center.x;
      const ty = (center.y * canvasScale) / scaleRef.current - center.y;
      const o = offset.get();
      offsetRef.current = { left: o.x - tx, top: o.y - ty };
    }
    scaleRef.current = canvasScale;
  }

  useWheel(
    (state) => {
      if (state.event.ctrlKey) return; // handled elsewhere
      if (isZoomingRef.current) return;
      offset.translate({ x: state.delta[0], y: state.delta[1] });
    },
    {
      target: canvasRef,
      disabled: isNavigator,
    }
  );

  const innerCanvasRef = useRef<any>(null);

  const transformsRef = useRef<Transforms>(getTransforms(elements, margin));

  useEffect(() => {
    // TODO: if tool is not "select", should we exclude hidden elements in computing this...?
    transformsRef.current = getTransforms(elements, margin);
  }, [elements, margin]);

  // When the canvas elements change the extent changes and everything
  // will jump if we don't offset that change.  That's what we do below:
  const lastTransforms = useRef<Transforms | null>(null);
  useEffect(() => {
    if (isNavigator) return;
    if (lastTransforms.current != null) {
      // the transforms changed somewhow.   Maybe xmin/ymin changed.
      // Note changing coords to window...
      const x =
        (lastTransforms.current.xMin - transformsRef.current.xMin) *
        canvasScale;
      const y =
        (lastTransforms.current.yMin - transformsRef.current.yMin) *
        canvasScale;
      if (x || y) {
        // yes, they changed, so we shift over.
        offset.translate({ x, y });
      }
    }
    lastTransforms.current = transformsRef.current;
  }, [elements]);

  const mousePath = useRef<{ x: number; y: number }[] | null>(null);
  const penPreviewPath = useRef<{ x: number; y: number }[] | null>(null);
  const handRef = useRef<{
    start: Point;
    clientX: number;
    clientY: number;
  } | null>(null);
  const ignoreNextClick = useRef<boolean>(false);
  // position of mouse right now not transformed in any way,
  // just in case we need it. This is clientX, clientY off
  // of the canvas div.
  const mousePosRef = useRef<{ clientX: number; clientY: number } | null>(null);

  // this is in terms of window coords:
  const [selectRect, setSelectRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const [edgePreview, setEdgePreview] = useState<Point | null>(null);

  const penCanvasRef = useRef<any>(null);
  const penCanvasParamsRef = useRef<{
    scale: number;
    rect: {
      width: number;
      height: number;
      top: number;
      left: number;
    };
  }>({ scale: 1, rect: { left: 0, top: 0, width: 0, height: 0 } });
  const resize = useResizeObserver({ ref: canvasRef });
  useEffect(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect?.width) {
      // also update the canvas scale, which is needed to keep
      // the canvas preview layer (for the pen) from getting too big
      // and wasting memory.
      penCanvasParamsRef.current = {
        scale: getMaxCanvasSizeScale(
          penDPIFactor * rect.width,
          penDPIFactor * rect.height
        ),
        rect,
      };
    }
  }, [resize]);

  // Whenever the data <--> window transform params change,
  // ensure the current center of the viewport is preserved
  // or if the mouse is in the viewport, maintain its position.
  const lastViewport = useRef<Rect | undefined>(undefined);

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
    // Do this in next render loop, since otherwise it can sometimes
    // be premature and fail, e.g., when opening a document.
    setTimeout(() => setCenterPositionData(centerOfRect(viewport)), 0);
  }, [frame.desc.get("viewport")]);

  // If no set viewport, fit to screen.
  useEffect(() => {
    if (isNavigator) return;
    if (frame.desc.get("viewport") == null) {
      // document was never opened before in this browser,
      // so fit to screen.
      frame.actions.fitToScreen(frame.id, true);
    }
  }, []);

  function getToolElement(tool): Partial<Element> {
    const elt = getElement(tool, frame.desc.get(`${tool}Id`));
    if (elt.data?.aspectRatio) {
      const ar = aspectRatioToNumber(elt.data.aspectRatio);
      if (elt.w == null) {
        elt.w = 500;
      }
      elt.h = elt.w / (ar != 0 ? ar : 1);
    }
    return elt;
  }

  // get window coordinates of what is currently displayed in the exact
  // center of the viewport.
  function getCenterPositionWindow(): { x: number; y: number } | undefined {
    const c = canvasRef.current;
    if (c == null) return;
    const rect = c.getBoundingClientRect();
    if (rect == null) return;
    const d = scaleDivRef.current;
    if (d == null) return;
    // the current center of the viewport, but in window coordinates, i.e.,
    // absolute coordinates into the canvas div.
    const { x, y } = offset.get();
    return {
      x: -x + rect.width / 2,
      y: -y + rect.height / 2,
    };
  }

  // set center position in Data coordinates.
  function setCenterPositionData({ x, y }: Point): void {
    if (!isMountedRef.current) return;
    const t = dataToWindow({ x, y });
    const cur = getCenterPositionWindow();
    if (cur == null) return;
    const delta_x = t.x - cur.x;
    const delta_y = t.y - cur.y;
    offset.translate({ x: delta_x, y: delta_y });
  }

  // when fitToScreen is true, compute data then set font_size to
  // get zoom (plus offset) so everything is visible properly
  // on the page; also set fitToScreen back to false in
  // frame tree data.
  useEffect(() => {
    if (isNavigator || !frame.desc.get("fitToScreen")) return;
    try {
      const viewport = getViewportData();
      if (viewport == null) return;
      if (elements.length == 0) {
        // Special case -- the screen is blank; don't want to just
        // maximal zoom in on the center!
        setCenterPositionData({ x: 0, y: 0 });
        lastViewport.current = viewport;
        frame.actions.set_font_size(frame.id, zoomToFontSize(1));
        return;
      }
      lastViewport.current = viewport;
      const rect = rectSpan(elements);
      const s =
        Math.min(
          1 / 0.95,
          Math.max(MIN_ZOOM, fitRectToRect(rect, viewport).scale * canvasScale)
        ) * 0.95; // 0.95 for extra room too.
      scale.set(s);
      frame.actions.set_font_size(frame.id, zoomToFontSize(s));
      setCenterPositionData({
        x: rect.x + rect.w / 2,
        y: rect.y + rect.h / 2,
      });
      saveViewport();
    } finally {
      frame.actions.fitToScreen(frame.id, false);
    }
  }, [frame.desc.get("fitToScreen")]);

  const edgeStart =
    selectedTool == "edge" ? frame.desc.getIn(["edgeStart", "id"]) : undefined;

  let selectionHandled = false;
  function processElement(element, isNavRectangle = false) {
    const { id, rotate } = element;
    const { x, y, z, w, h } = getPosition(element);
    const t = transformsRef.current.dataToWindowNoScale(x, y, z);

    if (element.hide != null) {
      // element is hidden...
      if (readOnly || selectedTool != "select" || element.hide.frame) {
        // do not show at all for any tool except select, or if hidden as
        // part of a frame.
        return;
      }
      // Now it will get rendered, but in a minified way.
    }

    if (element.type == "edge") {
      if (elementsMap == null) return; // need elementsMap to render edges efficiently.
      // NOTE: edge doesn't handle showing edit bar for selection in case of one selected edge.
      return (
        <RenderEdge
          key={element.id}
          element={element}
          elementsMap={elementsMap}
          transforms={transformsRef.current}
          selected={selection?.has(element.id)}
          previewMode={previewMode}
          onClick={(e) => {
            frame.actions.setSelection(
              frame.id,
              element.id,
              e.altKey || e.shiftKey || e.metaKey ? "add" : "only"
            );
          }}
        />
      );
    }

    if (previewMode && !isNavRectangle) {
      if (element.type == "edge") {
        // ignore edges in preview mode.
        return;
      }
      // This just shows blue boxes in the nav map, instead of actually
      // rendering something. It's probably faster and easier,
      // but really rendering something is much more usable.  Sometimes this
      // is more useful, e.g., with small text.  User can easily toggle to
      // get this by clicking the map icon.
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
    if (focused) {
      selectionHandled = true;
    }

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
                  }px ${SELECTED_BORDER_TYPE} ${
                    frame.desc.get("editFocus")
                      ? EDIT_BORDER_COLOR
                      : SELECTED_BORDER_COLOR
                  }`,
                  marginLeft: `-${
                    (SELECTED_BORDER_WIDTH + SELECTED_PADDING) / canvasScale
                  }px`,
                  marginTop: `-${
                    (SELECTED_BORDER_WIDTH + SELECTED_PADDING) / canvasScale
                  }px`,
                  padding: `${SELECTED_PADDING / canvasScale}px`,
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
          transforms={transformsRef.current}
          readOnly={readOnly}
          cursors={cursors?.[id]}
        >
          {elt}
        </Focused>
      );
    } else {
      const isEdgeStart = selectedTool == "edge" && edgeStart == id;
      return (
        <Position
          key={id}
          x={t.x}
          y={t.y}
          z={isNavRectangle ? z : isEdgeStart ? MAX_ELEMENTS : t.z}
          w={w}
          h={h}
        >
          <Cursors cursors={cursors?.[id]} canvasScale={canvasScale} />
          <NotFocused
            id={id}
            selectable={selectedTool == "select"}
            edgeCreate={selectedTool == "edge"}
            edgeStart={isEdgeStart}
            frame={frame}
          >
            {elt}
          </NotFocused>
        </Position>
      );
    }
  }

  const v: ReactNode[] = [];

  for (const element of elements) {
    const x = processElement(element);
    if (x != null) {
      v.push(x);
    }
  }

  if (!selectionHandled && selection != null && selection.size >= 1) {
    // create a virtual selection element that
    // contains the region spanned by all elements
    // in the selection.
    // TODO: This could be optimized with better data structures...
    const selectedElements = elements.filter((element) =>
      selection.has(element.id)
    );
    const selectedRects: Element[] = [];
    let multi: undefined | boolean = undefined;
    let isAllEdges = true;
    for (const element of selectedElements) {
      if (element.type == "edge" && elementsMap != null) {
        multi = true;
        // replace edges by source/dest elements.
        for (const x of ["from", "to"]) {
          const a = elementsMap?.get(element.data?.[x] ?? "")?.toJS();
          if (a != null) {
            selectedRects.push(a);
          }
        }
      } else {
        isAllEdges = false;
      }
      selectedRects.push(element);
    }
    const { xMin, yMin, xMax, yMax } = getPageSpan(selectedRects, 0);
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
        transforms={transformsRef.current}
        readOnly={readOnly}
        multi={multi}
      >
        {!isAllEdges && (
          <RenderElement element={element} canvasScale={canvasScale} focused />
        )}
      </Focused>
    );
  }

  if (
    elementsMap != null &&
    selectedTool == "edge" &&
    edgeStart &&
    edgePreview
  ) {
    // Draw arrow from source element to where mouse is now.
    const element = getToolElement("edge");
    if (element.data == null) throw Error("bug");
    element.data = { ...element.data, from: edgeStart, previewTo: edgePreview };
    v.push(
      <RenderEdge
        key="edge-preview"
        element={element as Element}
        elementsMap={elementsMap}
        transforms={transformsRef.current}
        zIndex={0}
      />
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
          onStart={() => {
            ignoreNextClick.current = true;
          }}
          onStop={(_, data) => {
            if (visible == null) return;
            const { x, y } = centerOfRect(visible);
            frame.actions.setViewportCenter(frame.id, {
              x: x + data.x,
              y: y + data.y,
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
    const off = offset.get();
    return {
      x: -off.x + x - rect.left,
      y: -off.y + y - rect.top,
    };
  }

  // window coords to data coords
  function windowToData({ x, y }: Point): Point {
    return transformsRef.current.windowToDataNoScale(
      x / scaleRef.current,
      y / scaleRef.current
    );
  }
  function dataToWindow({ x, y }: Point): Point {
    const p = transformsRef.current.dataToWindowNoScale(x, y);
    p.x *= scaleRef.current;
    p.y *= scaleRef.current;
    return { x: p.x, y: p.y };
  }
  /****************************************************/
  // The viewport in *data* coordinates
  function getViewportData(): Rect | undefined {
    const v = getViewportWindow();
    if (v == null) return;
    const { x, y } = windowToData(v);
    return { x, y, w: v.w / scaleRef.current, h: v.h / scaleRef.current };
  }
  // The viewport in *window* coordinates
  function getViewportWindow(): Rect | undefined {
    const c = canvasRef.current;
    if (c == null) return;
    const { width: w, height: h } = c.getBoundingClientRect();
    if (!w || !h) {
      // this happens when canvas is hidden from screen (e.g., background tab).
      return;
    }
    const { x, y } = offset.get();
    return { x: -x, y: -y, w, h };
  }

  // convert mouse event to coordinates in data space
  function evtToData(e): Point {
    if (e.changedTouches?.length > 0) {
      e = e.changedTouches[0];
    } else if (e.touches?.length > 0) {
      e = e.touches[0];
    }
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
    if (selectedTool == "hand") {
      return;
    }
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
    if (selectedTool == "edge") {
      // Creating an edge with the edge tool works like this:
      //   1. Click once to select "from" element.
      //   2. Click second time to select "to" element.
      if (edgePreview) {
        frame.actions.clearEdgeCreateStart(frame.id);
        setEdgePreview(null);
      }
      return;
    }

    const position: Partial<Element> = {
      ...evtToData(e),
      z: transformsRef.current.zMax + 1,
    };
    let elt: Partial<Element> = { type: selectedTool as any };

    // TODO -- move some of this to the spec?
    if (selectedTool == "note") {
      elt = getToolElement("note");
    } else if (selectedTool == "timer") {
      elt = getToolElement("timer");
    } else if (selectedTool == "icon") {
      elt = getToolElement("icon");
    } else if (selectedTool == "text") {
      elt = getToolElement("text");
    } else if (selectedTool == "code") {
      elt = getToolElement("code");
      elt.w = 650;
      // TODO: this is silly...
      elt.h = 16 + 2 * (elt.data?.fontSize ?? DEFAULT_FONT_SIZE);
    } else if (selectedTool == "frame") {
      elt = getToolElement("frame");
    } else if (selectedTool == "chat") {
      elt.w = 375;
      elt.h = 450;
    }

    const element = {
      ...position,
      ...elt,
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
      frame.actions.setEditFocus(frame.id, true);
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
        }, 100);
      }, []);

  const onMouseDown = (e) => {
    if (selectedTool == "hand" || e.button == MIDDLE_MOUSE_BUTTON) {
      const c = canvasRef.current;
      if (c == null) return;
      handRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        start: offset.get(),
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
      penPreviewPath.current = [{ x: e.clientX, y: e.clientY }];
      ignoreNextClick.current = true;
      return;
    }
  };

  const onTouchStart = (e) => {
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
          transformsRef.current.windowToDataNoScale(p0.x, p0.y),
          transformsRef.current.windowToDataNoScale(p1.x, p1.y)
        );
        if (selectedTool == "frame") {
          // make a frame at the selection.  Note that we put
          // it UNDER everything.
          const elt = getToolElement("frame");
          if (elt.data?.aspectRatio) {
            const ar = aspectRatioToNumber(elt.data.aspectRatio);
            if (ar != 0) {
              rect.h = rect.w / ar;
            }
          }

          const { id } = frame.actions.createElement(
            { ...elt, ...rect, z: transformsRef.current.zMin - 1 },
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
        penPreviewPath.current = null;
        const canvas = penCanvasRef.current;
        if (canvas != null) {
          // we wait slightly before hiding/clearing it, so
          // the preview doesn't go away before the
          // non-preview is rendered (i.e., flicker).
          setTimeout(() => {
            const ctx = canvas.getContext("2d");
            if (ctx != null) {
              clearCanvas({ ctx });
              if (penPreviewPath.current == null) {
                // only hide if a new path didn't start!
                canvas.style.setProperty("visibility", "hidden");
              }
            }
          }, 0);
        }
        if (mousePath.current == null || mousePath.current.length <= 0) {
          return;
        }
        ignoreNextClick.current = true;
        // Rounding makes things look really bad when zoom is much greater
        // than 100%, so if user is zoomed in doing something precise, we
        // preserve the full points.
        const toData =
          fontSizeToZoom(font_size) < 1
            ? ({ x, y }) =>
                pointRound(transformsRef.current.windowToDataNoScale(x, y))
            : ({ x, y }) => transformsRef.current.windowToDataNoScale(x, y);

        const { x, y } = toData(mousePath.current[0]);
        let xMin = x,
          xMax = x;
        let yMin = y,
          yMax = y;
        const path: Point[] = [{ x, y }];
        let prevPt = path[0];
        let n = 0;
        for (const pt of mousePath.current.slice(1)) {
          n += 1;
          const thisPt = toData(pt);
          if (
            pointEqual(prevPt, thisPt, 0.5) &&
            n < mousePath.current.length - 1 /* so don't skip last point */
          ) {
            prevPt = thisPt;
            continue;
          }
          prevPt = thisPt;
          const { x, y } = thisPt;
          path.push({ x, y });
          if (x < xMin) xMin = x;
          if (x > xMax) xMax = x;
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
        for (const pt of path) {
          pt.x = pt.x - xMin;
          pt.y = pt.y - yMin;
        }

        frame.actions.createElement(
          {
            x: xMin,
            y: yMin,
            z: transformsRef.current.zMax + 1,
            w: xMax - xMin + 1,
            h: yMax - yMin + 1,
            data: { path: compressPath(path), ...getToolElement("pen").data },
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
    const { x, y } = offset.get();
    return {
      x: (-x + e.clientX - rect.left) / scaleRef.current,
      y: (-y + e.clientY - rect.top) / scaleRef.current,
    };
  }

  const onMouseMove = (e, touch = false) => {
    // this us used for zooming, etc.
    mousePosRef.current = { clientX: e.clientX, clientY: e.clientY };

    if (selectedTool == "edge" && edgeStart) {
      setEdgePreview(evtToData(e));
      return;
    }

    if (!touch && !e.buttons) {
      // mouse button no longer down - cancel any capture.
      // This can happen with no mouseup, due to mouseup outside
      // of the div, i.e., drag off the edge.
      onMouseUp(e);
      return;
    }
    if (handRef.current != null) {
      // dragging with hand tool
      if (isZoomingRef.current) return;
      const c = canvasRef.current;
      if (c == null) return;
      const { clientX, clientY, start } = handRef.current;
      const deltaX = e.clientX - clientX;
      const deltaY = e.clientY - clientY;
      offset.set({ x: start.x + deltaX, y: start.y + deltaY });
      return;
    }
    if (mousePath.current == null) return;
    e.preventDefault?.(); // only makes sense for mouse not touch.

    if (selectedTool == "select" || selectedTool == "frame") {
      if (isZoomingRef.current) return;
      const point = getMousePos(e);
      if (point == null) return;
      mousePath.current[1] = point;
      setSelectRect(pointsToRect(mousePath.current[0], mousePath.current[1]));
      return;
    }

    if (selectedTool == "pen") {
      // mousePath is used for the actual path when creating the elemnts,
      // and is in data coordinates:
      const point = getMousePos(e);
      if (point == null) return;
      mousePath.current.push(point);

      // Rest of this code is just for drawing a preview of the path:
      if (penPreviewPath.current != null) {
        penPreviewPath.current.push({ x: e.clientX, y: e.clientY });
      } else {
        return;
      }
      const canvas = penCanvasRef.current;
      if (canvas == null) return;
      const ctx = canvas.getContext("2d");
      if (ctx == null) return;

      if (penPreviewPath.current.length <= 2) {
        // initialize
        canvas.style.setProperty("visibility", "visible");
        clearCanvas({ ctx });
        ctx.restore();
        ctx.save();
        ctx.scale(penDPIFactor, penDPIFactor);
      }
      // Actually draw it:
      const path: Point[] = [];
      const { rect } = penCanvasParamsRef.current;
      for (const point of penPreviewPath.current.slice(
        penPreviewPath.current.length - 2
      )) {
        path.push({
          x: (point.x - rect.left) / penDPIFactor,
          y: (point.y - rect.top) / penDPIFactor,
        });
      }
      const { color, radius, opacity } = getToolElement("pen").data ?? {};
      drawCurve({
        ctx,
        path,
        color,
        radius: (scaleRef.current * (radius ?? 1)) / penDPIFactor,
        opacity,
      });
      return;
    }
  };

  const onTouchMove = (e) => {
    onMouseMove(e.touches[0], true);
    if (selectedTool == "pen") {
      e.preventDefault();
    }
  };

  //   if (!isNavigator) {
  //     window.x = {
  //       scaleDivRef,
  //       canvasRef,
  //       offset,
  //       scale,
  //       frame,
  //       saveViewport,
  //     };
  //   }

  return (
    <div
      className={"smc-vfill"}
      ref={canvasRef}
      style={{
        ...style,
        touchAction:
          typeof selectedTool == "string" &&
          ["hand", "select", "pen", "frame"].includes(selectedTool)
            ? "none"
            : undefined,
        overflow: "hidden",
        position: "relative",
      }}
      onClick={(evt) => {
        mousePath.current = null;
        if (isNavigator) {
          if (ignoreNextClick.current) {
            ignoreNextClick.current = false;
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
        isNavigator
          ? undefined
          : (event: ClipboardEvent<HTMLDivElement>) => {
              if (editFocus) return;
              event.preventDefault();
              const selectedElements = getSelectedElements({
                elements,
                selection,
              });
              extendToIncludeEdges(selectedElements, elements);
              const encoded = encodeForCopy(selectedElements);
              event.clipboardData.setData(
                "application/x-cocalc-whiteboard",
                encoded
              );
            }
      }
      onCut={
        isNavigator || readOnly
          ? undefined
          : (event: ClipboardEvent<HTMLDivElement>) => {
              if (editFocus) return;
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
              frame.actions.deleteElements(selectedElements);
            }
      }
      onPaste={
        isNavigator || readOnly
          ? undefined
          : (event: ClipboardEvent<HTMLDivElement>) => {
              if (editFocus) return;
              const encoded = event.clipboardData.getData(
                "application/x-cocalc-whiteboard"
              );
              if (encoded) {
                // copy/paste between whiteboards of their own structured data
                const pastedElements = decodeForPaste(encoded);
                /* TODO: should also get where mouse is? */
                let target: Point | undefined = undefined;
                const pos = getMousePos(mousePosRef.current);
                if (pos != null) {
                  const { x, y } = pos;
                  target = transformsRef.current.windowToDataNoScale(x, y);
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
      {!isNavigator && selectedTool == "pen" && (
        <canvas
          className="smc-vfill"
          ref={penCanvasRef}
          width={
            penCanvasParamsRef.current.scale *
            penDPIFactor *
            penCanvasParamsRef.current.rect.width
          }
          height={
            penCanvasParamsRef.current.scale *
            penDPIFactor *
            penCanvasParamsRef.current.rect.height
          }
          style={{
            cursor: TOOLS[selectedTool]?.cursor,
            position: "absolute",
            zIndex: MAX_ELEMENTS + 1,
            top: 0,
            left: 0,
            visibility: "hidden",
          }}
        />
      )}
      <div
        ref={scaleDivRef}
        style={{
          position: "absolute",
          left: `${offsetRef.current.left}px`,
          top: `${offsetRef.current.top}px`,
          transform: `scale(${canvasScale})`,
          /*transition: "transform left top 0.1s",*/
          transformOrigin: "top left",
        }}
      >
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
          {!isNavigator && (
            <Grid transforms={transformsRef.current} divRef={gridDivRef} />
          )}
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
