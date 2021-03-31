/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { Element as Element0 } from "slate";
import {
  register,
  SlateElement,
  RenderElementProps,
  useSlate,
} from "./register";
import { SlateMath } from "./math-widget";
import { useSetElement } from "./set-element";

export interface DisplayMath extends SlateElement {
  type: "display_math";
  value: string;
  isVoid: true;
}

export interface InlineMath extends SlateElement {
  type: "inline_math";
  value: string;
  isVoid: true;
  isInline: true;
}

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  if (element.type != "display_math" && element.type != "inline_math") {
    // type guard.
    throw Error("bug");
  }
  const editor = useSlate();
  const setElement = useSetElement(editor, element);

  return (
    <span {...attributes}>
      <SlateMath
        value={element.value}
        isInline={!!element["isInline"]}
        onChange={(value) => {
          setElement({ value });
        }}
      />
      {children}
    </span>
  );
};

register({
  slateType: "inline_math",
  Element,
  toSlate: ({ token }) => {
    return {
      type: "inline_math",
      value: token.content,
      isVoid: true,
      isInline: true,
      children: [{ text: "" }],
    } as Element0;
  },
  fromSlate: ({ node }) => {
    return "$" + node.value + "$";
  },
});

register({
  slateType: "display_math",
  Element,
  toSlate: ({ token }) => {
    return {
      type: "display_math",
      value: token.content.trim(),
      isVoid: true,
      children: [{ text: " " }],
    } as Element0;
  },
  fromSlate: ({ node }) => {
    return "$$\n" + node.value + "\n$$\n\n";
  },
});
