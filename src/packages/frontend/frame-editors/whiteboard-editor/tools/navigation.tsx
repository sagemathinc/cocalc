/*
Map navigation panel.

This reproduces some of the functionality in the top button bar,
but in a way that is always present and with an additional
high level map view.
*/

import { ReactNode } from "react";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { Button, Tooltip } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { getPageSpan, fontSizeToZoom, ZOOM100 } from "../math";
import { Actions } from "../actions";
import { PANEL_STYLE } from "./panel";
import Canvas from "../canvas";
import { Element } from "../types";

const TOOLS = {
  map: {
    width: "40px",
    icon: "sitemap" /* todo */,
    tip: "Toggle map",
    click: (actions, id) => {
      actions.toggleMap(id);
    },
  },
  fit: {
    width: "40px",
    icon: "ColumnWidthOutlined",
    tip: "Fit to screen",
    click: (actions, id) => {
      actions.fitToScreen(id);
    },
  },
  zoomOut: {
    width: "40px",
    icon: "search-minus",
    tip: "Zoom out",
    click: (actions, id) => {
      actions.decrease_font_size(id);
    },
  },
  zoomIn: {
    width: "40px",
    icon: "search-plus",
    tip: "Zoom in",
    click: (actions, id) => {
      actions.increase_font_size(id);
    },
  },
  zoom100: {
    width: "50px",
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

interface Props {
  fontSize?: number;
  elements: Element[];
}

export default function Navigation({ fontSize, elements }: Props) {
  const { desc } = useFrameContext();
  const v: ReactNode[] = [];
  for (const tool in TOOLS) {
    v.push(<Tool key={tool} tool={tool} fontSize={fontSize} />);
  }
  const showMap = !desc.get("hideMap") && elements != null;
  return (
    <div
      className="smc-vfill"
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        right: 0,
        bottom: 0,
        width: `${MAP_WIDTH}px`,
        height: `${33 + (showMap ? MAP_HEIGHT : 0)}px`,
      }}
    >
      {!desc.get("hideMap") && elements != null && <Map elements={elements} />}
      <div style={{ display: "flex", borderTop: "1px solid #ddd" }}>{v}</div>
    </div>
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
          fontSize: "18px",
          color: tool == "map" && !desc.get("hideMap") ? "blue" : undefined,
        }}
      >
        {typeof icon == "string" ? <Icon name={icon} /> : icon(fontSize)}
      </Button>
    </Tooltip>
  );
}

function Map({ elements }) {
  const { xMin, yMin, xMax, yMax } = getPageSpan(elements, 1);
  const xDiff = xMax - xMin;
  const yDiff = yMax - yMin;
  const scale = Math.min(MAP_WIDTH / xDiff, MAP_HEIGHT / yDiff);
  const xRange = xDiff * scale;
  const yRange = yDiff * scale;
  const paddingTop = (MAP_HEIGHT - yRange) / 2;
  const paddingLeft = (MAP_WIDTH - xRange) / 2;

  return (
    <div
      style={{
        width: `${MAP_WIDTH}px`,
        height: `${MAP_HEIGHT}px`,
        paddingTop,
        paddingLeft,
      }}
      className="smc-vfill"
    >
      <Canvas margin={0} isNavigator elements={elements} scale={scale} />
    </div>
  );
}
