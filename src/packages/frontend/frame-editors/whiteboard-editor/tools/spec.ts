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
  config?: Set<ConfigParams>; // what you can configure *after* you place the item.
  hideFromToolbar?: boolean;
  readOnly?: boolean; // if true, show this tool even in readonly view
  resizable?: boolean; // if true, show resize handles.  Some things should only resize via adapting to their content.
  key?: string | string[]; // keyboard shortcut or shortcuts
}

export const TOOLS: { [tool: string]: ToolDescription } = {
  hand: {
    icon: "hand",
    cursor: "grab",
    tip: "Hand tool - move canvas",
    readOnly: true,
    key: "h", // same as photoshop "hand tool" -- https://helpx.adobe.com/photoshop/using/default-keyboard-shortcuts.html
  },
  select: {
    icon: "mousepointer",
    cursor: "default",
    tip: "Select",
    readOnly: true,
    key: "a", // matches photoshop's "Direct Selection tool"
  },
  text: {
    icon: "text1",
    cursor: "text",
    tip: "Text",
    config: new Set(["fontFamily", "fontSize", "color"]),
    key: "t",
  },
  note: {
    icon: "note",
    cursor: "crosshair",
    tip: "Sticky Note",
    config: new Set(["fontFamily", "fontSize", "color"]),
    key: "n",
  },
  pen: {
    icon: "pen",
    cursor: "crosshair",
    tip: "Pen",
    config: new Set(["color", "radius"]),
    resizable: true,
    key: "p",
  },
  code: {
    icon: "jupyter",
    cursor: "crosshair",
    tip: "Jupyter Code Cell",
    config: new Set(["fontSize", "color", "radius"]),
    resizable: true,
    key: "j",
  },
  icon: {
    icon: "icons",
    cursor: "crosshair",
    tip: "Icons",
    config: new Set(["fontSize", "color"]),
    key: "i",
  },
  chat: {
    icon: "comment",
    cursor: "crosshair",
    tip: "Chat",
    config: new Set(["fontSize", "color"]),
    key: "c",
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
  frame: {
    icon: "frame",
    cursor: "crosshair",
    tip: "Frame",
    config: new Set(["color", "radius"]),
    key: "f",
  },
  //shape: { icon: "square", cursor: "crosshair", tip: "Shape", key:"s" },
};

export type Tool = keyof typeof TOOLS;
