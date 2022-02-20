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

export default function TextToolPanel() {
  return <ToolPanel tool={TOOL} presetManager={presetManager} />;
}

export const textParams = presetManager.getPreset;
