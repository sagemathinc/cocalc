/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { RenderElementProps, useSlate } from "slate-react";
import { Transforms, Element as Element0 } from "slate";
import { register, SlateElement } from "./register";
import { SlateMath } from "../math";

export interface Math extends SlateElement {
  type: "math";
  value: string;
  isVoid: true;
  isInline: true;
}

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  if (element.type != "math") throw Error("bug");
  const editor = useSlate();
  return (
    <span {...attributes}>
      <SlateMath
        value={element.value}
        onChange={(value) => {
          Transforms.setNodes(editor, { value } as any, {
            match: (node) => node["type"] == "math",
          });
        }}
      />
      {children}
    </span>
  );
};

function toSlate({ token, children }) {
  return {
    type: "math",
    value: token.content,
    isVoid: true,
    isInline: true,
    children,
  } as Element0;
}

register({
  slateType: "math",
  Element,
  toSlate,
  fromSlate: ({ node }) => node.value,
});
