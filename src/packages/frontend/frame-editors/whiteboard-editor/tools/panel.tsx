/*

Floating panel from which you can select a tool.

*/

import { CSSProperties, ReactNode } from "react";
import { Button, Tooltip, Typography } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { r_join } from "@cocalc/frontend/components/r_join";
import { TOOLS, Tool } from "./spec";
import { useFrameContext } from "../hooks";
import { MAX_ELEMENTS } from "../math";
import { SELECTED } from "./common";

export const PANEL_STYLE = {
  zIndex: MAX_ELEMENTS + 1,
  position: "absolute",
  fontSize: "18px",
  boxShadow: "0 0 5px grey",
  borderRadius: "3px",
  margin: "10px",
  background: "white",
} as CSSProperties;

interface Props {
  selectedTool: Tool;
  readOnly?: boolean;
}

export default function Panel({ selectedTool, readOnly }: Props) {
  const v: ReactNode[] = [];
  for (const tool in TOOLS) {
    if (TOOLS[tool].hideFromToolbar) continue;
    if (readOnly && !TOOLS[tool].readOnly) continue;
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
  const { icon, tip, key } = TOOLS[tool];
  return (
    <Tooltip
      placement="right"
      title={
        key == null ? (
          tip
        ) : (
          <>
            {tip} <Key keys={key} />
          </>
        )
      }
    >
      <Button
        type="text"
        onClick={() => {
          actions.setSelectedTool(id, tool);
        }}
        style={isSelected ? { color: "#fff", background: SELECTED } : undefined}
      >
        <Icon
          name={icon}
          style={{
            fontSize: "16px",
          }}
        />
      </Button>
    </Tooltip>
  );
}

export function Key({ keys }: { keys: string | string[] }) {
  if (typeof keys == "string") {
    return <Typography.Text keyboard>{keys.toUpperCase()}</Typography.Text>;
  } else {
    return r_join(keys.map((k: string) => <Key key={k} keys={k} />));
  }
}
