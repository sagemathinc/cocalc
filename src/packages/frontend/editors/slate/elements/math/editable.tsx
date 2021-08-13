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
  fromSlate: ({ node }) => {
    return "$" + node.value + "$";
  },
});

register({
  slateType: "display_math",
  Element,
  fromSlate: ({ node }) => {
    return "$$\n" + node.value + "\n$$\n\n";
  },
});
