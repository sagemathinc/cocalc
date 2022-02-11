import { ReactNode } from "react";

// TODO: terrible icons...  need to add more.
import { IconName } from "@cocalc/frontend/components/icon";

export type ConfigParams = "fontFamily" | "fontSize" | "radius" | "color";

interface ToolDescription {
  icon: IconName;
  cursor?: string;
  tip: ReactNode;
  config?: Set<ConfigParams>;
  hideFromToolbar?: boolean;
}

export const TOOLS: { [tool: string]: ToolDescription } = {
  select: { icon: "select-outlined", cursor: "default", tip: "Select" },
  text: {
    icon: "text",
    cursor: "text",
    tip: "Text",
    config: new Set(["fontFamily", "fontSize", "color"]),
  },
  note: {
    icon: "note",
    cursor: "crosshair",
    tip: "Note",
    config: new Set(["fontFamily", "fontSize", "color"]),
  },
  pen: {
    icon: "pen",
    cursor: "crosshair",
    tip: "Pen",
    config: new Set(["color", "radius"]),
  },
  code: {
    icon: "jupyter",
    cursor: "crosshair",
    tip: "Jupyter Code",
    config: new Set(["fontSize", "color", "radius"]),
  },
  icon: {
    icon: "square",
    cursor: "crosshair",
    tip: "Icon",
    config: new Set(["fontSize", "color"]),
  },
  //shape: { icon: "square", cursor: "crosshair", tip: "Shape" },
  chat: {
    icon: "comment",
    cursor: "crosshair",
    tip: "Chat",
    config: new Set(["fontSize", "color"]),
  },
  //   terminal: {
  //     icon: "code-outlined",
  //     cursor: "crosshair",
  //     tip: "Terminal",
  //   },
  stopwatch: {
    icon: "stopwatch",
    cursor: "crosshair",
    tip: "Stopwatch",
    config: new Set(["fontFamily", "fontSize", "color"]),
  },
  timer: {
    icon: "hourglass-half",
    cursor: "crosshair",
    tip: "Countdown Timer",
    config: new Set(["fontFamily", "fontSize", "color"]),
  },
  edge: {
    hideFromToolbar: true,
    icon: "network-wired", // really bad
    tip: "Edge",
    config: new Set(["color", "radius"]),
  },
};

export type Tool = keyof typeof TOOLS;
