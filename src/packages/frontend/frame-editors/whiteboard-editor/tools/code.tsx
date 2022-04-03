/*
The code cell config panel.
*/

import ToolPanel, { getPresetManager, Tool } from "./tool-panel";
import { DEFAULT_FONT_SIZE } from "./defaults";
import { COLORS as PEN_COLORS } from "./pen";
const COLORS = ["#ccc"].concat(PEN_COLORS.slice(0, PEN_COLORS.length - 1));

const tool = "code" as Tool;

interface Params {
  color: string;
  fontSize?: number;
  radius?: number;
}

export default function CodeToolPanel() {
  return (
    <ToolPanel
      tool={tool}
      presetManager={presetManager}
      Preview={Preview}
      ButtonPreview={ButtonPreview}
      buttonTitle={({ fontSize, radius, color }) =>
        `Font size: ${fontSize ?? DEFAULT_FONT_SIZE}px` +
        (color ? `; Border: ${color}` : "") +
        (radius ? `; Width: ${2 * radius}px` : "")
      }
      style={{ width: "138px" }}
      editParamsStyle={{ left: "145px" }}
      editableParams={new Set(["fontSize", "radius", "color"])}
    />
  );
}

const DEFAULTS: Params[] = [];
for (let id = 0; id < COLORS.length; id++) {
  DEFAULTS.push({ color: COLORS[id], radius: 0.5 });
}

const presetManager = getPresetManager<Params>(tool, DEFAULTS);

function Preview({ fontSize, radius = 1, color }: Params) {
  return (
    <div
      style={{
        border: `${radius * 2}px solid ${color}`,
        borderRadius: "3px",
        margin: "auto",
        padding: "5px",
        width: "200px",
        fontSize: `${fontSize ?? DEFAULT_FONT_SIZE}px`,
        overflow: "hidden",
      }}
    >
      <pre>{"a = 2\nb = 3\na + b"}</pre>
    </div>
  );
}

function ButtonPreview({ radius = 1, color }: Params) {
  return (
    <div
      style={{
        padding: 0,
        margin: 0,
        border: `${radius * 2}px solid ${color}`,
        width: "50px",
        height: "25px",
        fontSize: "14px",
        overflow: "hidden",
      }}
    >
      2+3
    </div>
  );
}
