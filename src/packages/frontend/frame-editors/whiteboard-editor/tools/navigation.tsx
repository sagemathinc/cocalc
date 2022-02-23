/*
Map navigation panel.

This reproduces some of the functionality in the top button bar,
but in a way that is always present and with an additional
high level map view.
*/

import { IS_IOS, IS_IPAD } from "@cocalc/frontend/feature";
import { ReactNode, useState } from "react";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { Button, Tooltip } from "antd";
import { useFrameContext } from "../hooks";
import { Actions } from "../actions";
import { getPageSpan, fontSizeToZoom, MAX_ELEMENTS, ZOOM100 } from "../math";
import { PANEL_STYLE } from "./panel";
import Canvas from "../canvas";
import { Element } from "../types";
import Draggable from "react-draggable";
import {
  SELECTED_BORDER_COLOR,
  SELECTED_BORDER_TYPE,
  SELECTED_BORDER_WIDTH,
} from "../focused";
const PREVIEW_THRESH = 0.07;

const TOOLS = {
  map: {
    width: "35px",
    icon: "map",
    tip: "Toggle map",
    click: (actions, id) => {
      actions.toggleMap(id);
    },
  },
  fit: {
    width: "35px",
    icon: "ColumnWidthOutlined",
    tip: "Fit to screen",
    click: (actions, id) => {
      actions.fitToScreen(id);
    },
  },
  zoomOut: {
    width: "35px",
    icon: "search-minus",
    tip: "Zoom out",
    click: (actions, id) => {
      actions.decrease_font_size(id);
    },
  },
  zoomIn: {
    width: "35px",
    icon: "search-plus",
    tip: "Zoom in",
    click: (actions, id) => {
      actions.increase_font_size(id);
    },
  },
  zoom100: {
    width: "60px",
    icon: (fontSize) => <>{Math.round(100 * fontSizeToZoom(fontSize))}%</>,
    tip: "Zoom to 100%",
    click: (actions, id) => {
      actions.set_font_size(id, ZOOM100);
    },
  },
} as {
  [tool: string]: {
    icon: Function | IconName;
    tip: string;
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
}

export default function Navigation({ fontSize, elements }: Props) {
  const [resize, setResize] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const { desc } = useFrameContext();
  const width = desc.get("navWidth") ?? MAP_WIDTH;
  const height = desc.get("navHeight") ?? MAP_HEIGHT;
  const v: ReactNode[] = [];
  for (const tool in TOOLS) {
    v.push(<Tool key={tool} tool={tool} fontSize={fontSize} />);
  }
  const showMap = !desc.get("hideMap") && elements != null;
  return (
    <>
      <div
        className="smc-vfill"
        style={{
          ...PANEL_STYLE,
          display: "flex",
          flexDirection: "column",
          right: 0,
          bottom:
            IS_IOS || IS_IPAD
              ? 30
              : 0 /* hack due to bottom of screen gets scrolled away on ios */,
          width: `${width}px`,
          height: `${BAR_HEIGHT + (showMap ? height : 0)}px`,
        }}
      >
        {!desc.get("hideMap") && elements != null && (
          <Map
            elements={elements}
            width={width}
            height={height}
            resize={resize}
            setResize={setResize}
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

function Tool({ tool, fontSize }) {
  const { actions, id, desc } = useFrameContext();
  const { icon, tip, click, width } = TOOLS[tool];
  return (
    <Tooltip placement="top" title={tip}>
      <Button
        type="text"
        onClick={() => click(actions as Actions, id)}
        style={{
          width,
          fontSize: "16px",
          color: tool == "map" && !desc.get("hideMap") ? "blue" : undefined,
        }}
      >
        {typeof icon == "string" ? <Icon name={icon} /> : icon(fontSize)}
      </Button>
    </Tooltip>
  );
}

function Map({ elements, width, height, resize, setResize }) {
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
        previewMode={scale <= PREVIEW_THRESH}
        margin={10 / scale}
        elements={elements}
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
