/*

Floating panel from which you can select a tool.

*/

import { CSSProperties, ReactNode } from "react";
import { Button, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { TOOLS } from "./spec";
import { useFrameContext } from "../hooks";

export const PANEL_STYLE = {
  zIndex: 1000,
  position: "absolute",
  fontSize: "18px",
  boxShadow: "0 0 5px grey",
  borderRadius: "3px",
  margin: "10px",
  background: "white",
} as CSSProperties;

export default function Panel({ selectedTool }) {
  const v: ReactNode[] = [];
  for (const tool in TOOLS) {
    v.push(
      <ToolButton key={tool} tool={tool} isSelected={tool == selectedTool} />
    );
  }
  return (
    <div
      style={{
        ...PANEL_STYLE,
        width: "46px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {v}
    </div>
  );
}

function ToolButton({ tool, isSelected }) {
  const { actions, id } = useFrameContext();
  const { icon, tip } = TOOLS[tool];
  return (
    <Tooltip placement="right" title={tip}>
      <Button
        type="text"
        onClick={() => {
          actions.setSelectedTool(id, tool);
        }}
      >
        <Icon
          name={icon}
          style={{
            color: isSelected ? "blue" : undefined,
          }}
        />
      </Button>
    </Tooltip>
  );
}
