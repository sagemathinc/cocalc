/*

Floating panel from which you can select a tool.

*/

import { ReactNode } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { TOOLS } from "./spec";
import Draggable from "react-draggable";

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
          zIndex: 1000000,
          position: "absolute",
          fontSize: "24px",
          display: "flex",
          flexDirection: "column",
          padding: "15px",
          boxShadow: "0 0 10px",
          margin: "15px",
        }}
      >
        {v}
      </div>
    </Draggable>
  );
}

function ToolButton({ tool, isSelected }) {
  const { icon } = TOOLS[tool];
  return (
    <Icon
      onClick={() => console.log("select", tool)}
      name={icon}
      style={{
        margin: "10px 0",
        color: isSelected ? "blue" : undefined,
      }}
    />
  );
}
