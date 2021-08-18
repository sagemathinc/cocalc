/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { Element } from "slate";
import { register, RenderElementProps, SlateElement } from "../register";
import mathToHtml from "@cocalc/frontend/misc/math-to-html";

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

const StaticElement: React.FC<RenderElementProps> = ({
  attributes,
  element,
}) => {
  if (element.type != "display_math" && element.type != "inline_math") {
    // type guard.
    throw Error("bug");
  }
  const { value } = element;
  const { err, __html } = React.useMemo(
    () => mathToHtml(value, element.type == "inline_math"),
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
  slateType: "inline_math",
  StaticElement,
  toSlate: ({ token }) => {
    return {
      type: "inline_math",
      value: token.content,
      isVoid: true,
      isInline: true,
      children: [{ text: "" }],
    } as Element;
  },
});

register({
  slateType: "display_math",
  StaticElement,
  toSlate: ({ token }) => {
    return {
      type: "display_math",
      value: token.content.trim(),
      isVoid: true,
      children: [{ text: " " }],
    } as Element;
  },
});
