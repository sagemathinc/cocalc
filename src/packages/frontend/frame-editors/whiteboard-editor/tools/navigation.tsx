/*
Overview navigation panel.

This reproduces some of the functionality in the top button bar,
but in a way that is always present and with an additional
high level map view.

(Obviously, inspired by miro.com, which is inspired by many other things...)
*/

import { ReactNode } from "react";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { Button, Tooltip } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { fontSizeToZoom, ZOOM100 } from "../math";
import { Actions } from "../actions";
import { PANEL_STYLE } from "./panel";

const TOOLS = {
  fit: {
    width: "30px",
    icon: "ColumnWidthOutlined",
    tip: "Fit to screen",
    click: (actions, id) => {
      actions.fitToScreen(id);
    },
  },
  zoomOut: {
    width: "30px",
    icon: "search-minus",
    tip: "Zoom out",
    click: (actions, id) => {
      actions.decrease_font_size(id);
    },
  },
  zoomIn: {
    width: "30px",
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

export default function Navigation({ fontSize }) {
  const v: ReactNode[] = [];
  for (const tool in TOOLS) {
    v.push(<Tool key={tool} tool={tool} fontSize={fontSize} />);
  }
  return (
    <div
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        right: 0,
        bottom: 0,
      }}
    >
      <Overview />
      <div style={{ display: "flex" }}>{v}</div>
    </div>
  );
}

function Tool({ tool, fontSize }) {
  const { actions, id } = useFrameContext();
  const { icon, tip, click, width } = TOOLS[tool];
  return (
    <Tooltip placement="top" title={tip}>
      <Button
        type="text"
        onClick={() => click(actions as Actions, id)}
        style={{ width, padding: "5px" }}
      >
        {typeof icon == "string" ? <Icon name={icon} /> : icon(fontSize)}
      </Button>
    </Tooltip>
  );
}

function Overview() {
  return null; // return <div>This is an overview.</div>;
}
