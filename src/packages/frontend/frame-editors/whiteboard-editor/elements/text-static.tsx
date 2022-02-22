import { Element } from "../types";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

interface Props {
  element: Element;
}

export const PADDING: number = 10;

export default function Text({ element }: Props) {
  const style = { ...getStyle(element), padding: PADDING };
  return (
    <StaticMarkdown
      value={element.str?.trim() ? element.str : "Type text"}
      style={style}
    />
  );
}

export function getStyle(
  element,
  defaults?: {
    color?: string;
    fontSize?: number;
    fontFamily?: string;
    background?: string;
  }
) {
  return {
    color: element.data?.color ?? defaults?.color,
    fontSize: element.data?.fontSize ?? defaults?.fontSize,
    fontFamily: element.data?.fontFamily ?? defaults?.fontFamily,
    background: element.data?.background ?? defaults?.background,
  };
}
