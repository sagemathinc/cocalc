/*
The frame config panel.

Frame configuration:

- color (of the border)
- radius (of the border)
- aspect ratio
*/

import ToolPanel, { getPresetManager, Tool } from "./tool-panel";
import { defaultRadius } from "./defaults";

export type AspectRatio = "custom" | "a4" | "letter" | "16:9" | "4:3" | "1:1";

export const DEFAULT_ASPECT_RATIO = "custom";

interface Params {
  aspectRatio?: AspectRatio;
  color?: string;
  radius?: number;
}

const DEFAULTS: Params[] = [
  { aspectRatio: "custom" },
  { aspectRatio: "a4" },
  { aspectRatio: "letter" },
  { aspectRatio: "16:9" },
  { aspectRatio: "4:3" },
  { aspectRatio: "1:1" },
];

export function aspectRatioToNumber(ar: AspectRatio): number {
  switch (ar) {
    case "custom":
      return 0;
    case "a4":
      return 1 / Math.sqrt(2);
    case "letter":
      return 1 / 1.2941;
    case "16:9":
      return 16 / 9;
    case "4:3":
      return 4 / 3;
    case "1:1":
      return 1;
  }
  return 0;
}

const tool = "frame" as Tool;

export default function FrameToolPanel() {
  return (
    <ToolPanel
      tool={tool}
      presetManager={presetManager}
      Preview={Preview}
      ButtonPreview={ButtonPreview}
      editableParams={new Set(["color", "radius"])}
      style={{ width: "130px" }}
      editParamsStyle={{ left: "120px" }}
      presetStyle={{ height: "65px", width: "65px", margin: 0 }}
    />
  );
}

const presetManager = getPresetManager<Params>(tool, DEFAULTS);

function Preview({ color, radius, aspectRatio, width }) {
  const ar = aspectRatioToNumber(aspectRatio ?? DEFAULT_ASPECT_RATIO);
  width = width ?? 110;
  return (
    <div style={{ textAlign: "center", padding: "5px" }}>
      {
        <div
          style={{
            border: `${2 * (radius ?? defaultRadius)}px solid ${
              color ?? "#000"
            }`,
            width: `${width}px`,
            height: `${width / (ar != 0 ? ar : 1)}px`,
            borderRadius: width > 100 ? "3px" : undefined,
            boxShadow: width > 100 ? "1px 3px 5px #ccc" : undefined,
            margin: "auto",
          }}
        ></div>
      }
      <div style={{ fontSize: width > 50 ? "14px" : "11px", color: "#666" }}>
        {aspectRatio}
      </div>
    </div>
  );
}

function ButtonPreview({ color, aspectRatio }: Params) {
  return (
    <Preview color={color} aspectRatio={aspectRatio} radius={0.5} width={30} />
  );
}
