/*
The edge tool panel.
*/

import ToolPanel, { getPresetManager, Tool } from "./tool-panel";
import { defaultRadius, maxRadius } from "./defaults";

interface Params {
  color?: string;
  radius?: number;
  opacity?: number;
}

export const COLORS = [
  "#252937",
  "#95067a",
  "#2b6855",
  "#db3e00",
  "#009ac1",
  "#fcb900",
];

const RADS = [0.5, 2];

const numEdges = COLORS.length * RADS.length;

function kthPreset(k) {
  return {
    radius: RADS[k % RADS.length] ?? defaultRadius,
    color: COLORS[Math.floor(k / RADS.length) % COLORS.length] ?? "#000",
  };
}

const DEFAULTS: Params[] = [];
for (let id = 0; id < numEdges; id++) {
  DEFAULTS.push(kthPreset(id));
}

const tool = "edge" as Tool;

export default function EdgePanel() {
  return (
    <ToolPanel
      tool={tool}
      presetManager={presetManager}
      Preview={EdgePreview}
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
    />
  );
}

const presetManager = getPresetManager<Params>(tool, DEFAULTS);

export function EdgePreview({
  radius,
  color,
  opacity,
}: {
  radius: number;
  color: string;
  opacity?: number;
}) {
  return (
    <div
      style={{
        width: `${(maxRadius + 1) * 2}px`,
        height: `${(maxRadius + 1) * 2}px`,
        paddingTop: `${maxRadius + 1 - radius}px`,
        opacity,
      }}
    >
      <div
        style={{
          width: "100%",
          height: `${Math.min(radius, maxRadius) * 2}px`,
          background: color,
        }}
      ></div>
    </div>
  );
}
