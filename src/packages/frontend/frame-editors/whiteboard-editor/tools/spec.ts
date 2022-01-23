// TODO: terrible icons...  need to add more.
import { IconName } from "@cocalc/frontend/components/icon";

interface ToolDescription {
  icon: IconName;
}

export const TOOLS: { [tool: string]: ToolDescription } = {
  select: { icon: "arrow-up" },
  text: { icon: "font" },
  note: { icon: "file" },
  shape: { icon: "file-image" },
  pen: { icon: "pencil" },
  chat: { icon: "comment" },
  code: { icon: "jupyter" },
};

export type Tool = keyof typeof TOOLS;
