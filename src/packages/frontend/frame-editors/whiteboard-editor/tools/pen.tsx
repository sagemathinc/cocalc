/*
The pen panel.
*/

import { Button, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import ToolPanel, { getPresetManager, Tool } from "./tool-panel";
import { defaultRadius, maxRadius } from "./defaults";
import { SELECTED } from "./common";

interface Params {
  color?: string;
  countdown?: number;
  radius?: number;
  opacity?: number;
}

export const COLORS = [
  "#252937",
  "#95067a",
  "#2b6855",
  "#53b79c",
  "#c1003c",
  "#82bc0e",
  "#009ac1",
  "#411a09",
];
/*
  "#db482d",
  "#e0d200",
  "#002bdb",
  "#6a4acb",
];
*/

const RADS = [1, 4];

const HIGHLIGHTER = -1;
const ERASER = -2;

const numBrushes = COLORS.length * RADS.length;

function kthPreset(k) {
  return {
    //radius: RADS[Math.floor(k / COLORS.length) % RADS.length],
    //color: COLORS[k % COLORS.length] ?? "#000",
    radius: RADS[k % RADS.length] ?? defaultRadius,
    color: COLORS[Math.floor(k / RADS.length) % COLORS.length] ?? "#000",
  };
}

const DEFAULTS: Params[] = [];
for (let id = 0; id < numBrushes; id++) {
  DEFAULTS.push(kthPreset(id));
}

const tool = "pen" as Tool;

export default function PenToolPanel() {
  return (
    <ToolPanel
      tool={tool}
      presetManager={presetManager}
      Preview={BrushPreview}
      buttonTitle={({ color, radius, opacity }: Params) =>
        `Color: ${color}, Radius: ${radius}px` +
        (opacity ? `, Opacity: ${opacity}` : "")
      }
      editableParams={new Set(["radius", "color", "opacity"])}
      style={{ width: "100px" }}
      presetStyle={{
        marginTop: "-14px",
      }}
      editParamsStyle={{ left: "108px" }}
      AlternateTop={AlternateTop}
    />
  );
}

const presetManager = getPresetManager<Params>(tool, DEFAULTS, {
  [HIGHLIGHTER]: { color: "#ffff00", opacity: 0.4, radius: 15 },
  [ERASER]: { color: "#ffffff", radius: 15 },
});

function AlternateTop({
  setSelected,
  selected,
}: {
  setSelected: (number) => void;
  selected: number;
}) {
  const fontSize = "20px";
  return (
    <div style={{ margin: "5px 0 10px -8px" }}>
      <div style={{ textAlign: "center", color: "#666", fontSize: "14px" }}>
        Pen
      </div>
      <Tooltip title="Pen">
        <Button
          style={{ width: "25px" }}
          type="text"
          onClick={() => setSelected(0)}
        >
          <Icon
            style={{ fontSize, color: selected >= 0 ? SELECTED : undefined }}
            name="pencil"
          />
        </Button>
      </Tooltip>
      <Tooltip title="Highlighter">
        <Button
          style={{ width: "25px" }}
          type="text"
          onClick={() => setSelected(HIGHLIGHTER)}
        >
          <Icon
            style={{
              fontSize,
              color: selected == HIGHLIGHTER ? SELECTED : undefined,
            }}
            name="blog"
          />
        </Button>
      </Tooltip>
      <Tooltip title="Eraser">
        <Button
          style={{ width: "25px" }}
          type="text"
          onClick={() => setSelected(ERASER)}
        >
          <Icon
            style={{
              fontSize,
              color: selected == ERASER ? SELECTED : undefined,
            }}
            name="eraser"
          />
        </Button>
      </Tooltip>
    </div>
  );
}

export function BrushPreview({
  radius,
  color,
}: {
  radius: number;
  color: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: `${(maxRadius + 1) * 2}px`,
        height: `${(maxRadius + 1) * 2}px`,
        borderRadius: `${maxRadius + 1}px`,
        background: "white",
        border: `3px solid ${color ?? "#ccc"}`,
        paddingLeft: `${maxRadius + 1 - radius - 3}px`,
        paddingTop: `${maxRadius + 1 - radius - 3}px`,
      }}
    >
      <div
        style={{
          width: `${Math.min(radius, maxRadius - 2) * 2}px`,
          height: `${Math.min(radius, maxRadius - 2) * 2}px`,
          borderRadius: `${Math.min(radius, maxRadius - 2)}px`,
          background: color,
        }}
      ></div>
    </div>
  );
}
