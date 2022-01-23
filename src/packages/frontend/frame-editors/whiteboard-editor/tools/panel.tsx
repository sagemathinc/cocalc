/*

Floating panel from which you can select a tool.

*/

import { ReactNode } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { TOOLS } from "./spec";
import Draggable from "react-draggable";
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
    <Draggable>
      <div
        style={{
          zIndex: 1000,
          position: "absolute",
          fontSize: "24px",
          display: "flex",
          flexDirection: "column",
          padding: "10px",
          boxShadow: "0 0 10px",
          margin: "10px",
          background: "white",
          opacity: 0.95,
        }}
      >
        {v}
      </div>
    </Draggable>
  );
}

function ToolButton({ tool, isSelected }) {
  const { actions, id } = useFrameContext();
  const { icon } = TOOLS[tool];
  return (
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
  );
}
