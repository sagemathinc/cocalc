import { ReactNode } from "react";

// TODO: terrible icons...  need to add more.
import { IconName } from "@cocalc/frontend/components/icon";
import { ElementType, Element } from "../types";
import { DEFAULT_FONT_SIZE } from "./defaults";

export type ConfigParams =
  | "fontFamily"
  | "fontSize"
  | "radius"
  | "color"
  | "opacity"
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
  type?: ElementType;
  size?: (Element) => { w: number; h: number };
  select?: boolean; // if true, select and set to edit on create
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
    key: "v", // "v" = what figma and miro use.
  },
  edge: {
    icon: "arrow-right",
    tip: "Edge",
    config: new Set(["color", "radius", "opacity"]),
    key: "e",
    type: "edge",
  },
  text: {
    icon: "text1",
    cursor: "text",
    tip: "Text",
    config: new Set(["fontFamily", "fontSize", "color"]),
    key: "t",
    type: "text",
    select: true,
  },
  note: {
    icon: "note",
    cursor: "crosshair",
    tip: "Sticky Note",
    config: new Set(["fontFamily", "fontSize", "color"]),
    key: "n",
    type: "note",
    select: true,
  },
  pen: {
    icon: "pen",
    cursor: "crosshair",
    tip: "Pen",
    config: new Set(["color", "radius", "opacity"]),
    resizable: true,
    key: "p",
    type: "pen",
  },
  code: {
    select: true,
    icon: "jupyter",
    cursor: "crosshair",
    tip: "Jupyter Code Cell",
    config: new Set(["fontSize", "color", "radius"]),
    resizable: true,
    key: "j",
    type: "code",
    size: (element) => {
      return {
        w: 650,
        h: 16 + 6 * (element.data?.fontSize ?? DEFAULT_FONT_SIZE),
      };
    },
  },
  icon: {
    icon: "icons",
    cursor: "crosshair",
    tip: "Icons",
    config: new Set(["fontSize", "color"]),
    key: "i",
    type: "icon",
  },
  chat: {
    icon: "comment",
    cursor: "crosshair",
    tip: "Chat",
    config: new Set(["color"]),
    key: "c",
    type: "chat",
    select: true,
    size: () => {
      return { w: 375, h: 450 };
    },
  },
  timer: {
    icon: "stopwatch",
    cursor: "crosshair",
    tip: "Stopwatches and Timers",
    config: new Set(["fontFamily", "fontSize", "color", "countdown"]),
    key: "s",
    select: true,
    type: "timer",
  },
  frame: {
    icon: "frame",
    cursor: "crosshair",
    tip: "Frame",
    config: new Set(["color", "radius"]),
    key: "f",
    type: "frame",
  },
  //shape: { icon: "square", cursor: "crosshair", tip: "Shape", key:"s" },
};

export type Tool = keyof typeof TOOLS;
