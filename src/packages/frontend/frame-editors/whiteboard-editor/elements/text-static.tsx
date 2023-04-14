import { CSSProperties } from "react";
import { Element } from "../types";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { DEFAULT_FONT_SIZE, DEFAULT_FONT_FAMILY } from "../tools/defaults";

interface Props {
  element: Element;
}

export const PADDING: number = 5;
export const PLACEHOLDER = "Type text...";

export default function Text({ element }: Props) {
  const isEmpty = !element.str?.trim();
  return (
    <StaticMarkdown
      value={isEmpty ? element.data?.placeholder ?? PLACEHOLDER : element.str ?? ""}
      style={getFullStyle(element, isEmpty)}
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
  let fontFamily =
    element.data?.fontFamily ?? defaults?.fontFamily ?? DEFAULT_FONT_FAMILY;
  if (fontFamily == "Sans") {
    // for historical reasons, mainly -- see packages/frontend/editors/editor-button-bar.ts too
    fontFamily = "sans-serif";
  }
  return {
    color: element.data?.color ?? defaults?.color,
    fontSize: element.data?.fontSize ?? defaults?.fontSize ?? DEFAULT_FONT_SIZE,
    fontFamily,
    background: element.data?.background ?? defaults?.background,
  };
}

export function getFullStyle(
  element: Element,
  isEmpty: boolean
): CSSProperties {
  return {
    opacity: isEmpty ? 0.5 : undefined, // similar to what antd input does: https://stackoverflow.com/questions/56095371/how-can-i-change-the-placeholder-color-in-ant-designs-select-component; they use 0.4 which is really too light.
    ...getStyle(element),
    padding: `${PADDING}px`,
    height: "auto",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  };
}
