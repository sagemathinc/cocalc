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
  note: { icon: "file", cursor: "crosshair", tip: "Sticky Note" },
  shape: { icon: "square", cursor: "crosshair", tip: "Shape" },
  pen: { icon: "pencil", cursor: "crosshair", tip: "Pen" },
  chat: { icon: "comment", cursor: "crosshair", tip: "Chat" },
  code: { icon: "jupyter", cursor: "crosshair", tip: "Jupyter Code Cell" },
  terminal: {
    icon: "code-outlined",
    cursor: "crosshair",
    tip: "Command Line Terminal",
  },
  stopwatch: { icon: "stopwatch", cursor: "crosshair", tip: "Stopwatch" },
};

export type Tool = keyof typeof TOOLS;
