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
    let s = "$" + node.value + "$";
    if (node.display) {
      s = "$" + s + "$";
    }
    return s;
  },
});

register({
  slateType: "math_block",
  Element,
  fromSlate: ({ node }) => {
    return "$$\n" + node.value + "\n$$\n\n";
  },
});
