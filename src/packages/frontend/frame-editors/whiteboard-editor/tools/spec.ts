// TODO: terrible icons...  need to add more.
import { IconName } from "@cocalc/frontend/components/icon";

interface ToolDescription {
  icon: IconName;
  cursor: string;
}

export const TOOLS: { [tool: string]: ToolDescription } = {
  select: { icon: "arrow-up", cursor: "default" },
  text: { icon: "font", cursor: "text" },
  note: { icon: "file", cursor },
  shape: { icon: "file-image" },
  pen: { icon: "pencil" },
  chat: { icon: "comment" },
  code: { icon: "jupyter" },
};

export type Tool = keyof typeof TOOLS;
