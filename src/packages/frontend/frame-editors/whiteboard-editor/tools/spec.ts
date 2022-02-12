import { ReactNode } from "react";

// TODO: terrible icons...  need to add more.
import { IconName } from "@cocalc/frontend/components/icon";

export type ConfigParams =
  | "fontFamily"
  | "fontSize"
  | "radius"
  | "color"
  | "countdown";

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
    tip: "Sticky Note",
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
    tip: "Icons",
    config: new Set(["fontSize", "color"]),
  },
  chat: {
    icon: "comment",
    cursor: "crosshair",
    tip: "Chat",
    config: new Set(["fontSize", "color"]),
  },
  timer: {
    icon: "stopwatch",
    cursor: "crosshair",
    tip: "Stopwatches and Timers",
    config: new Set(["fontFamily", "fontSize", "color", "countdown"]),
  },
  edge: {
    hideFromToolbar: true,
    icon: "network-wired", // really bad
    tip: "Edge",
    config: new Set(["color", "radius"]),
  },
  //shape: { icon: "square", cursor: "crosshair", tip: "Shape" },
};

export type Tool = keyof typeof TOOLS;
