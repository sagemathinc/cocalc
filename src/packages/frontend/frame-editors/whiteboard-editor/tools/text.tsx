/*
The text config panel.
*/

import ToolPanel, { getPresetManager, Tool } from "./tool-panel";
import { COLORS } from "./pen";
import { DEFAULT_FONT_SIZE } from "./defaults";

const TOOL = "text" as Tool;

interface Params {
  color: string;
  fontSize: number;
  fontFamily?: string;
}
const numTextTypes = COLORS.length;
function defaultPresets(): Params[] {
  const presets: Params[] = [];
  for (let id = 0; id < numTextTypes; id++) {
    presets.push({ fontSize: DEFAULT_FONT_SIZE, color: COLORS[id] });
  }
  return presets;
}

const presetManager = getPresetManager<Params>(TOOL, defaultPresets);

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

export default function TextToolPanel() {
  return (
    <ToolPanel
      tool={TOOL}
      presetManager={presetManager}
      Preview={Preview}
      ButtonPreview={ButtonPreview}
      style={{ width: "58px" }}
    />
  );
}

export const textParams = presetManager.getPreset;
