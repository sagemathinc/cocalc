/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { Element } from "slate";
import { register, RenderElementProps, SlateElement } from "../register";
import mathToHtml from "@cocalc/frontend/misc/math-to-html";

export interface DisplayMath extends SlateElement {
  type: "math_block";
  value: string;
  isVoid: true;
}

export interface InlineMath extends SlateElement {
  type: "math_inline";
  value: string;
  display?: boolean; // inline but acts as displayed math
  isVoid: true;
  isInline: true;
}

const StaticElement: React.FC<RenderElementProps> = ({
  attributes,
  element,
}) => {
  if (element.type != "math_block" && element.type != "math_inline") {
    // type guard.
    throw Error("bug");
  }
  const { value } = element;
  const { err, __html } = React.useMemo(
    () => mathToHtml(value, element.type == "math_inline" && !element.display),
    [value]
  );

  return err ? (
    <span
      {...attributes}
      style={{
        backgroundColor: "#fff2f0",
        border: "1px solid #ffccc7",
        padding: "5px 10px",
      }}
    >
      {err}
    </span>
  ) : (
    <span {...attributes} dangerouslySetInnerHTML={{ __html }}></span>
  );
};

register({
  slateType: ["math_inline", "math_inline_double"],
  StaticElement,
  toSlate: ({ token }) => {
    return {
      type: "math_inline",
      value: token.content,
      isVoid: true,
      isInline: true,
      children: [{ text: "" }],
      display: token.type == "math_inline_double",
    } as Element;
  },
});

register({
  slateType: ["math_block", "math_block_eqno"],
  StaticElement,
  toSlate: ({ token }) => {
    return {
      type: "math_block",
      value: token.content.trim(),
      isVoid: true,
      children: [{ text: "" }],
    } as Element;
  },
});
