/*
The text config panel.
*/

import ToolPanel, { getPresetManager, Tool } from "./tool-panel";
import { COLORS } from "./pen";
import { DEFAULT_FONT_SIZE } from "./defaults";

const tool = "text" as Tool;

interface Params {
  color: string;
  fontSize?: number;
  fontFamily?: string;
}

export default function TextToolPanel() {
  return (
    <ToolPanel
      tool={tool}
      presetManager={presetManager}
      Preview={Preview}
      ButtonPreview={ButtonPreview}
      buttonTitle={({ fontSize, fontFamily, color }) =>
        `Font size: ${fontSize}px` +
        (fontFamily ? `; Font family: ${fontFamily}` : "") +
        (color ? `; Color: ${color}` : "")
      }
      style={{ width: "120px" }}
      editParamsStyle={{ left: "129px" }}
      editableParams={new Set(["fontSize", "fontFamily", "color"])}
    />
  );
}

const DEFAULTS: Params[] = [];
for (let id = 0; id < COLORS.length; id++) {
  DEFAULTS.push({ color: COLORS[id] });
}

const presetManager = getPresetManager<Params>(tool, DEFAULTS);

function Preview({ fontSize, fontFamily, color }: Params) {
  const n = fontSize ?? DEFAULT_FONT_SIZE;
  return (
    <div
      style={{
        margin: "auto",
        width: "200px",
        height: `${n + 20}px`,
        fontSize: `${n}px`,
        fontFamily,
        color,
        textAlign: "center",
      }}
    >
      Text
    </div>
  );
}

function ButtonPreview({ fontFamily, color }: Params) {
  return (
    <div
      style={{
        width: "40px",
        fontSize: "14px",
        fontWeight: "bold",
        fontFamily,
        color,
      }}
    >
      Text
    </div>
  );
}
