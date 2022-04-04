/*
The time config panel.

Time configuration:

- fontSize, fontFamily
- color
- countdown timer or stopwatch
*/

import ToolPanel, { getPresetManager, Tool } from "./tool-panel";
import { TimeAmount, TimerIcon } from "@cocalc/frontend/editors/stopwatch/time";

interface Params {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  countdown?: number;
}

const COLORS = ["#252937", "#db482d", "#002bdb"];
const DEFAULTS: Params[] = [];
for (const countdown of [null, 60]) {
  for (const color of COLORS) {
    DEFAULTS.push({
      color,
      ...(countdown ? { countdown } : undefined),
    });
  }
}

const tool = "timer" as Tool;

export default function TimerToolPanel() {
  return (
    <ToolPanel
      tool={tool}
      presetManager={presetManager}
      Preview={Preview}
      ButtonPreview={ButtonPreview}
      buttonTitle={({ countdown }: Params) =>
        countdown != null ? "Countdown Timer" : "Stopwatch"
      }
      editableParams={new Set(["fontSize", "fontFamily", "color", "countdown"])}
      style={{ width: "110px" }}
      editParamsStyle={{ left: "120px" }}
    />
  );
}

const presetManager = getPresetManager<Params>(tool, DEFAULTS);

function Preview({ fontFamily, fontSize, color, countdown }: Params) {
  return (
    <div
      style={{
        textAlign: "center",
        fontSize: fontSize ? `${fontSize}px` : undefined,
        color,
      }}
    >
      <TimerIcon countdown={countdown} />{" "}
      <TimeAmount
        style={{ fontFamily }}
        amount={countdown == null ? 0 : countdown * 1000}
        compact
      />
    </div>
  );
}

function ButtonPreview({ fontFamily, color, countdown }: Params) {
  return <Preview {...{ fontFamily, color, countdown }} />;
}
