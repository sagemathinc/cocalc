/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { register, RenderElementProps } from "../register";
import { useSlate } from "../hooks";
import { SlateMath } from "./math-widget";
import { useSetElement } from "../set-element";

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  if (element.type != "math_block" && element.type != "math_inline") {
    // type guard.
    throw Error("bug");
  }
  const editor = useSlate();
  const setElement = useSetElement(editor, element);

  return (
    <span {...attributes}>
      <SlateMath
        value={element.value}
        isInline={!!element["isInline"] && !element["display"]}
        onChange={(value) => {
          setElement({ value });
        }}
      />
      {children}
    </span>
  );
};

register({
  slateType: "math_inline",
  Element,
  fromSlate: ({ node }) => {
    const delim = node.value.trim().startsWith("\\begin{")
      ? ""
      : node.display
      ? "$$"
      : "$";
    return `${delim}${node.value}${delim}`;
  },
});

register({
  slateType: "math_block",
  Element,
  fromSlate: ({ node }) => {
    const value = node.value.trim();
    let start, end;
    if (value.startsWith("\\begin{")) {
      start = "";
      end = "\n\n";
    } else {
      start = "\n$$\n";
      end = "\n$$\n\n";
    }
    return `${start}${value}${end}`;
  },
});
