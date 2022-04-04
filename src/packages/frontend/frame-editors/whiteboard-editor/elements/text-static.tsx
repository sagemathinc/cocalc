import { Element } from "../types";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

interface Props {
  element: Element;
}

export const PADDING: number = 5;
export const PLACEHOLDER = "Type text...";

export default function Text({ element }: Props) {
  const isEmpty = !element.str?.trim();
  const style = {
    opacity: isEmpty ? 0.5 : undefined, // similar to what antd input does: https://stackoverflow.com/questions/56095371/how-can-i-change-the-placeholder-color-in-ant-designs-select-component; they use 0.4 which is really too light.
    ...getStyle(element),
    padding: PADDING,
    height: "auto",
  };
  return (
    <StaticMarkdown
      value={isEmpty ? PLACEHOLDER : element.str ?? ""}
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
