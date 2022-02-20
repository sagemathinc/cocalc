/*
The text config panel.
*/

import ToolPanel, { getPresetManager, Tool } from "./tool-panel";
import { COLORS } from "./pen";
import { DEFAULT_FONT_SIZE } from "./defaults";

const tool = "text" as Tool;

interface Params {
  color: string;
  fontSize: number;
  fontFamily?: string;
}

export default function TextToolPanel() {
  return (
    <ToolPanel
      tool={tool}
      presetManager={presetManager}
      Preview={Preview}
      ButtonPreview={ButtonPreview}
      style={{ width: "66px" }}
      editableParams={new Set(["fontSize", "fontFamily", "color"])}
    />
  );
}

const DEFAULTS: Params[] = [];
for (let id = 0; id < COLORS.length; id++) {
  DEFAULTS.push({ fontSize: DEFAULT_FONT_SIZE, color: COLORS[id] });
}

const presetManager = getPresetManager<Params>(tool, DEFAULTS);

function Preview({ fontSize, fontFamily, color }: Params) {
  return (
    <div
      style={{
        margin: "auto",
        width: "200px",
        height: `${fontSize + 20}px`,
        fontSize: `${fontSize ?? DEFAULT_FONT_SIZE}px`,
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
      A
    </div>
  );
}
