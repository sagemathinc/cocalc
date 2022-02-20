/*
The icon config panel.

Icon configuration:

- name selected from the icons that are in components/icon.tsx.
- size in px
- color
*/

import ToolPanel, { getPresetManager, Tool } from "./tool-panel";
import { Icon, IconName } from "@cocalc/frontend/components/icon";

const ICONS: IconName[] = [
  "square",
  "circle",
  "jupyter",
  "sagemath",
  "tex",
  "bolt",
  "graduation-cap",
  "python",
  "r",
  "bullhorn",
  "calculator",
  "cocalc-ring",
  "bug",
  "exchange",
  "exclamation-triangle",
  "user",
];

const DEFAULTS: Params[] = [];
for (let id = 0; id < ICONS.length; id++) {
  DEFAULTS.push({ icon: ICONS[id] });
}

const tool = "icon" as Tool;

interface Params {
  icon: IconName;
  fontSize?: number;
  color?: string;
}

export default function IconToolPanel() {
  return (
    <ToolPanel
      tool={tool}
      presetManager={presetManager}
      Preview={Preview}
      ButtonPreview={ButtonPreview}
      buttonTitle={({ icon, fontSize }: Params) =>
        `Name: ${icon}` + (fontSize ? `, Size: ${fontSize}px` : "")
      }
      editableParams={new Set(["icon", "fontSize", "color"])}
      style={{ width: "55px" }}
      editParamsStyle={{ width: "350px", left: "64px" }}
    />
  );
}

const presetManager = getPresetManager<Params>(tool, DEFAULTS);

function Preview({ icon, fontSize, color }: Params) {
  return (
    <div style={{ textAlign: "center" }}>
      <Icon name={icon} style={{ color, fontSize }} />
    </div>
  );
}

function ButtonPreview({ icon, color }: Params) {
  return (
    <div
      style={{
        color,
        width: "30px",
        height: "25px",
      }}
    >
      <Icon name={icon} />
    </div>
  );
}
