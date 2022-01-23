/*

Floating panel from which you can select a tool.

*/

import { ReactNode } from "react";
import { Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { TOOLS } from "./spec";
//import Draggable from "react-draggable";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "../actions";

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
        zIndex: 1000,
        position: "absolute",
        fontSize: "18px",
        display: "flex",
        flexDirection: "column",
        padding: "10px",
        boxShadow: "0 0 10px",
        borderRadius: "3px",
        margin: "10px",
        background: "white",
        opacity: 0.95,
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
      <Icon
        onClick={() => {
          (actions as Actions).setSelectedTool(id, tool);
        }}
        name={icon}
        style={{
          margin: "10px 0",
          color: isSelected ? "blue" : undefined,
        }}
      />
    </Tooltip>
  );
}
