/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { Element } from "slate";
import { register, RenderElementProps, SlateElement } from "../register";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import DefaultMath from "@cocalc/frontend/components/math/ssr";

export interface DisplayMath extends SlateElement {
  type: "math_block";
  value: string;
  isVoid: true;
  isLaTeX: boolean;
}

export interface InlineMath extends SlateElement {
  type: "math_inline";
  value: string;
  display?: boolean; // inline but acts as displayed math
  isVoid: true;
  isInline: true;
  isLaTeX: false;
}

export const StaticElement: React.FC<RenderElementProps> = ({
  attributes,
  element,
}) => {
  const { MathComponent } = useFileContext();
  if (element.type != "math_block" && element.type != "math_inline") {
    // type guard.
    throw Error("bug");
  }
  const C = MathComponent ?? DefaultMath;
  return (
    <span {...attributes}>
      <C
        data={
          element.isLaTeX
            ? element.value
            : wrap(
                element.value,
                element.type == "math_inline" && !element.display
              )
        }
        inMarkdown
        isLaTeX={element.isLaTeX}
      />
    </span>
  );
};

function wrap(math, isInline) {
  math = "$" + math + "$";
  if (!isInline) {
    math = "$" + math + "$";
  }
  return math;
}

register({
  slateType: ["math_inline", "math_inline_double", "latex_inline"],
  StaticElement,
  toSlate: ({ token }) => {
    return {
      type: "math_inline",
      value:
        token.type == "latex_inline"
          ? token.content
          : stripMathEnvironment(token.content),
      isVoid: true,
      isInline: true,
      children: [{ text: "" }],
      display: token.type == "math_inline_double",
      isLaTeX: token.type == "latex_inline",
    } as Element;
  },
});

register({
  slateType: ["math_block", "latex_block"],
  StaticElement,
  toSlate: ({ token }) => {
    const content = token.content.trim();
    const isLaTeX = token.type == "latex_block" && !isMathEnvironment(content);
    return {
      type: "math_block",
      value: isLaTeX ? content : stripMathEnvironment(content),
      isVoid: true,
      children: [{ text: "" }],
      isLaTeX,
    } as Element;
  },
});

export function stripMathEnvironment(s: string): string {
  // These environments get detected, but we must remove them, since once in
  // math mode they make no sense. All the other environments do make sense.
  for (const env of ["math", "displaymath"]) {
    if (s.startsWith(`\\begin{${env}}`)) {
      return s.slice(
        `\\begin{${env}}`.length,
        s.length - `\\end{${env}}`.length
      );
    }
  }
  return s;
}

const MATH_ENVS = new Set(
  "equation*|equation|align*|align|alignat*|alignat|gather*|gather|multline*|multline|flalign*|flalign|split|math|displaymath".split(
    "|"
  )
);

// s is assumed to have been trim()'d
function isMathEnvironment(s: string) {
  if (!s.startsWith("\\")) return true;
  if (!s.startsWith("\\begin{")) {
    return false;
  } else {
    const i = s.indexOf("{");
    const j = s.indexOf("}");
    if (i == -1 || j == -1) return false;
    const env = s.slice(i + 1, j);
    if (!MATH_ENVS.has(env)) return false;
    if (!s.endsWith(`\\end{${env}}`)) return false;
  }
  return true;
}
