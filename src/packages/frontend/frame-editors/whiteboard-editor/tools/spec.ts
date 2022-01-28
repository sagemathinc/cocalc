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
  text: { icon: "text", cursor: "text", tip: "Text" },
  note: { icon: "note", cursor: "crosshair", tip: "Note" },
  pen: { icon: "pen", cursor: "crosshair", tip: "Pen" },
  code: { icon: "jupyter", cursor: "crosshair", tip: "Jupyter Code" },
  shape: { icon: "square", cursor: "crosshair", tip: "Shape" },
  chat: { icon: "comment", cursor: "crosshair", tip: "Chat" },
  //   terminal: {
  //     icon: "code-outlined",
  //     cursor: "crosshair",
  //     tip: "Terminal",
  //   },
  stopwatch: { icon: "stopwatch", cursor: "crosshair", tip: "Stopwatch" },
};

export type Tool = keyof typeof TOOLS;
