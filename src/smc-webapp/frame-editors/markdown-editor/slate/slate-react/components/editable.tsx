import * as React from "react";
import { Element, NodeEntry, Range, Text } from "slate";

import { WindowingParams } from "./children";
import { IS_ANDROID } from "../utils/environment";
import { AndroidEditable } from "./android-editable";
import { DefaultEditable } from "./default-editable";

/**
 * `RenderElementProps` are passed to the `renderElement` handler.
 */

export interface RenderElementProps {
  children: any;
  element: Element;
  attributes: {
    "data-slate-node": "element";
    "data-slate-inline"?: true;
    "data-slate-void"?: true;
    dir?: "rtl";
    ref: any;
  };
}

/**
 * `RenderLeafProps` are passed to the `renderLeaf` handler.
 */

export interface RenderLeafProps {
  children: any;
  leaf: Text;
  text: Text;
  attributes: {
    "data-slate-leaf": true;
  };
}

/**
 * `EditableProps` are passed to the `<Editable>` component.
 */

export type EditableProps = {
  decorate?: (entry: NodeEntry) => Range[];
  onDOMBeforeInput?: (event: Event) => void;
  placeholder?: string;
  readOnly?: boolean;
  role?: string;
  style?: React.CSSProperties;
  renderElement?: React.FC<RenderElementProps>;
  renderLeaf?: React.FC<RenderLeafProps>;
  as?: React.ElementType;
  windowing?: WindowingParams;
  divref?;
} & React.TextareaHTMLAttributes<HTMLDivElement>;

/**
 * Editable.
 */

export const Editable: React.FC<EditableProps> = (IS_ANDROID || true)
  ? AndroidEditable
  : DefaultEditable;
