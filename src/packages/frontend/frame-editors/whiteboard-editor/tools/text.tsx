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
const defaultParams = {
  fontSize: DEFAULT_FONT_SIZE,
  color: COLORS[0],
} as Params;

const presetManager = getPresetManager<Params>(TOOL, defaultParams);

export default function TextToolPanel() {
  return <ToolPanel tool={TOOL} presetManager={presetManager} />;
}

export const textParams = presetManager.getPreset;
