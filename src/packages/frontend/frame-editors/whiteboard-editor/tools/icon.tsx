/*
The icon config panel.

Icon configuration:

- name selected from the icons that are in components/icon.tsx.
- size in px
- color
*/

import ToolPanel, { getPresetManager, Tool } from "./tool-panel";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";

const ICONS: IconName[] = [
  "thumbs-up",
  "thumbs-down",
  "question-circle",
  "heart",
  "star",
  "plus-one",
  "jupyter",
  "smile",
  "frown",
  "fire",
  "sagemath",
  "tex",
  "bolt",
  "graduation-cap",
  "python",
  "r",
  "calculator",
  "cocalc-ring",
  "hand",
  "exchange",
  "exclamation-triangle",
  "user",
  "cube",
  "dot-circle",
];

const DEFAULTS: Params[] = [];
for (let id = 0; id < ICONS.length; id++) {
  DEFAULTS.push({ icon: ICONS[id], fontSize: 24 });
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
        `${capitalize(icon)}` + (fontSize ? `, Size: ${fontSize}px` : "")
      }
      editableParams={new Set(["icon", "fontSize", "color"])}
      style={{ width: "145px" }}
      editParamsStyle={{ width: "350px", left: "154px" }}
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
        height: "30px",
        textAlign: "center",
      }}
    >
      <Icon name={icon} style={{ fontSize: "24px" }} />
    </div>
  );
}
