import { ReactNode } from "react";

// TODO: terrible icons...  need to add more.
import { IconName } from "@cocalc/frontend/components/icon";

interface ToolDescription {
  icon: IconName;
  cursor?: string;
  tip: ReactNode;
}

export const TOOLS: { [tool: string]: ToolDescription } = {
  select: { icon: "select-outlined", cursor: "default", tip: "Select" },
  text: { icon: "font-size", cursor: "text", tip: "Text" },
  note: { icon: "file", cursor: "crosshair", tip: "Note" },
  code: { icon: "code", cursor: "crosshair", tip: "Code" },
  shape: { icon: "square", cursor: "crosshair", tip: "Shape" },
  pen: { icon: "pencil", cursor: "crosshair", tip: "Pen" },
  chat: { icon: "comment", cursor: "crosshair", tip: "Chat" },
  terminal: {
    icon: "code-outlined",
    cursor: "crosshair",
    tip: "Terminal",
  },
  stopwatch: { icon: "stopwatch", cursor: "crosshair", tip: "Stopwatch" },
};

export type Tool = keyof typeof TOOLS;
