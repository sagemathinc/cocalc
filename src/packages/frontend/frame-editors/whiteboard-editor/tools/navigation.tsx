/*
Map navigation panel.

This reproduces some of the functionality in the top button bar,
but in a way that is always present and with an additional
high level map view.
*/

import { ReactNode, useCallback, useEffect, useState } from "react";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { Button, Slider, Tooltip } from "antd";
import { useFrameContext } from "../hooks";
import { Actions } from "../actions";
import { getPageSpan, fontSizeToZoom, MAX_ELEMENTS } from "../math";
import { DEFAULT_FONT_SIZE, MIN_ZOOM, MAX_ZOOM } from "./defaults";
import { PANEL_STYLE } from "./panel";
import Canvas from "../canvas";
import { Element, ElementsMap } from "../types";
import Draggable from "react-draggable";
import {
  SELECTED_BORDER_COLOR,
  SELECTED_BORDER_TYPE,
  SELECTED_BORDER_WIDTH,
} from "../elements/style";
import { Key } from "./panel";
import { throttle } from "lodash";

const TOOLS = {
  map: {
    width: "35px",
    icon: ({ navMap }) => (
      <Icon name={navMap == "preview" ? "sitemap" : "map"} />
    ),
    tip: (
      <>
        {"Full --> Outline --> Hide"} <Key keys="m" />
      </>
    ),
    key: "m",
    click: (actions, id) => {
      actions.toggleMapType(id);
    },
  },
  fit: {
    width: "35px",
    icon: "ColumnWidthOutlined",
    tip: (
      <>
        Fit to screen <Key keys={["Ctrl+0", "⌘+0"]} />
      </>
    ),
    click: (actions, id) => {
      actions.fitToScreen(id);
    },
  },
  zoomOut: {
    width: "35px",
    icon: "search-minus",
    tip: (
      <>
        Zoom out <Key keys="-" />
      </>
    ),
    click: (actions, id) => {
      actions.decrease_font_size(id);
    },
  },
  zoomIn: {
    width: "35px",
    icon: "search-plus",
    tip: (
      <>
        Zoom in <Key keys="+" />
      </>
    ),
    click: (actions, id) => {
      actions.increase_font_size(id);
    },
  },
  zoom100: {
    width: "60px",
    icon: ({ zoomSlider }) => <>{zoomSlider}%</>,
    tip: (
      <>
        Zoom to 100% <Key keys="0" />
      </>
    ),
    click: (actions, id) => {
      actions.set_font_size(id, DEFAULT_FONT_SIZE);
    },
  },
} as {
  [tool: string]: {
    icon: Function | IconName;
    tip: ReactNode;
    click: (Actions, id) => void;
    width: string;
  };
};

const MAP_WIDTH = 275;
const MAP_HEIGHT = 175;
const BAR_HEIGHT = 33;

interface Props {
  fontSize?: number;
  elements: Element[];
  elementsMap?: ElementsMap;
}

export default function Navigation({ fontSize, elements, elementsMap }: Props) {
  const [resize, setResize] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const { actions, desc, id } = useFrameContext();
  const width = desc.get("navWidth") ?? MAP_WIDTH;
  const height = desc.get("navHeight") ?? MAP_HEIGHT;

  const [zoomSlider, setZoomSlider] = useState<number>(
    Math.round(100 * fontSizeToZoom(fontSize))
  );
  useEffect(() => {
    setZoomSlider(Math.round(100 * fontSizeToZoom(fontSize)));
  }, [fontSize]);

  const v: ReactNode[] = [];
  for (const tool in TOOLS) {
    v.push(<Tool key={tool} tool={tool} zoomSlider={zoomSlider} />);
  }
  const setFontSize = useCallback(
    throttle((value) => {
      actions.set_font_size(id, Math.round((DEFAULT_FONT_SIZE * value) / 100));
    }, 50),
    [id]
  );

  v.push(
    <Slider
      key="slider"
      style={{ flex: 1 }}
      value={zoomSlider}
      min={Math.floor(MIN_ZOOM * 100)}
      max={Math.ceil(MAX_ZOOM * 100)}
      onChange={(value) => {
        setZoomSlider(value);
        setFontSize(value);
      }}
    />
  );
  const navMap = desc.get("navMap", "map");
  const showMap = navMap != "hide" && elements != null;
  return (
    <>
      <div
        className="smc-vfill"
        style={{
          ...PANEL_STYLE,
          display: "flex",
          flexDirection: "column",
          right: 0,
          bottom: 0,
          width: `${width}px`,
          height: `${BAR_HEIGHT + (showMap ? height : 0)}px`,
        }}
      >
        {showMap && (
          <Map
            elements={elements}
            width={width}
            height={height}
            resize={resize}
            setResize={setResize}
            navMap={navMap}
            elementsMap={elementsMap}
          />
        )}
        <div style={{ display: "flex", borderTop: "1px solid #ddd" }}>{v}</div>
      </div>
      {resize.x || resize.y ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: `${width + resize.x}px`,
            height: `${BAR_HEIGHT + height + resize.y}px`,
            opacity: "0.5",
            background: "lightblue",
            border: `${SELECTED_BORDER_WIDTH}px ${SELECTED_BORDER_TYPE} ${SELECTED_BORDER_COLOR}`,
            zIndex: MAX_ELEMENTS + 5,
          }}
        ></div>
      ) : undefined}
    </>
  );
}

function Tool({ tool, zoomSlider }) {
  const { actions, id, desc } = useFrameContext();
  const { icon, tip, click, width } = TOOLS[tool];
  const navMap = desc.get("navMap", "map");
  return (
    <Tooltip placement="top" title={tip}>
      <Button
        type="text"
        onClick={() => click(actions as Actions, id)}
        style={{
          width,
          fontSize: "16px",
          color: tool == "map" && navMap != "hide" ? "blue" : undefined,
        }}
      >
        {typeof icon == "string" ? (
          <Icon name={icon} />
        ) : (
          icon({ zoomSlider, navMap })
        )}
      </Button>
    </Tooltip>
  );
}

function Map({
  elements,
  elementsMap,
  width,
  height,
  resize,
  setResize,
  navMap,
}) {
  const { id, actions } = useFrameContext();
  const { xMin, yMin, xMax, yMax } = getPageSpan(elements, 1);
  const xDiff = xMax - xMin;
  const yDiff = yMax - yMin;
  const scale = Math.min(width / xDiff, height / yDiff);
  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
      className="smc-vfill"
    >
      <Canvas
        isNavigator
        previewMode={navMap == "preview"}
        margin={10 / scale}
        elements={elements}
        elementsMap={elementsMap}
        scale={scale}
      />
      <Draggable
        position={{ x: 0, y: 0 }}
        bounds={{
          right: Math.max(0, width - MAP_WIDTH * 0.75),
          bottom: Math.max(0, height - MAP_HEIGHT * 0.75),
        }}
        onDrag={(_, data) => {
          setResize({ x: -data.x, y: -data.y });
        }}
        onStop={(_, data) => {
          setTimeout(() => {
            setResize({ x: 0, y: 0 });
            actions.set_frame_tree({
              id,
              navWidth: width - data.x,
              navHeight: height - data.y,
            });
          }, 0);
        }}
      >
        <Icon
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 1011,
            cursor: "nwse-resize",
            background: "white",
            color: "#888",
            visibility: resize.x || resize.y ? "hidden" : undefined,
          }}
          name="square"
        />
      </Draggable>
    </div>
  );
}
