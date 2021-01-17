/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../../app-framework";
import { RenderElementProps, useSlate } from "slate-react";
import { Transforms } from "slate";
import { register } from "./register";
import { SlateMath } from "../math";

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  const editor = useSlate();
  return (
    <span {...attributes}>
      <SlateMath
        value={element.value as string}
        onChange={(value) => {
          Transforms.setNodes(
            editor,
            { value },
            { match: (node) => node.type == "math" }
          );
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
  };
}

register({
  slateType: "math",
  Element,
  toSlate,
  fromSlate: ({ node }) => node.value as string,
});
