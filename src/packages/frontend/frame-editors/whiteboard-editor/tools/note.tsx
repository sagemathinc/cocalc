/*
The note config panel.
*/

import ToolPanel, { getPresetManager, Tool } from "./tool-panel";
import { DEFAULT_FONT_SIZE, NOTE_COLORS } from "./defaults";
import { STYLE } from "../elements/note-static";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

const tool = "note" as Tool;

interface Params {
  color: string;
  fontSize?: number;
  fontFamily?: string;
}

export default function NoteToolPanel() {
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
for (let id = 0; id < NOTE_COLORS.length; id++) {
  DEFAULTS.push({ color: NOTE_COLORS[id] });
}

const presetManager = getPresetManager<Params>(tool, DEFAULTS);

function Preview({ fontSize, fontFamily, color }: Params) {
  return (
    <div
      style={{
        ...STYLE,
        margin: "auto",
        background: color,
        width: "200px",
        height: "125px",
        fontSize: `${fontSize ?? DEFAULT_FONT_SIZE}px`,
        fontFamily,
        color: avatar_fontcolor(color),
        overflow: "hidden",
      }}
    >
      Note
    </div>
  );
}

function ButtonPreview({ fontFamily, color }: Params) {
  return (
    <div
      style={{
        ...STYLE,
        padding: 0,
        margin: 0,
        background: color,
        width: "50px",
        height: "25px",
        fontSize: "14px",
        fontFamily,
        color: avatar_fontcolor(color),
        overflow: "hidden",
      }}
    >
      A
    </div>
  );
}
