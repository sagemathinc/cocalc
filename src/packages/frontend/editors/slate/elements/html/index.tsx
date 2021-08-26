/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register, SlateElement } from "../register";
import { toSlate as toSlateImage } from "../image";
import HTML from "@cocalc/frontend/components/html-ssr";

export interface HtmlInline extends SlateElement {
  type: "html_inline";
  isInline: true;
  isVoid: true;
  html: string;
}

export interface HtmlBlock extends SlateElement {
  type: "html_block";
  isInline: false;
  isVoid: true;
  html: string;
}

const StaticElement = ({ attributes, element }) => {
  const html = ((element.html as string) ?? "").trim();
  // TODO: we need to process links somehow...
  // And to what extent do we need to sanitize this html?
  if (element.type == "html_inline") {
    return (
      <div {...attributes} style={{ display: "inline" }}>
        <HTML value={html} />
      </div>
    );
  } else {
    return (
      <div {...attributes}>
        <HTML value={html} />
      </div>
    );
  }
};

register({
  slateType: ["html_inline", "html_block"],

  toSlate: ({ type, token, children }) => {
    // Special case of images (one line, img tag);
    // we use a completely different function.
    if (
      token.content.startsWith("<img ") &&
      token.content.trim().split("\n").length <= 1
    ) {
      return toSlateImage({ type, token, children });
    }
    return {
      type: token.type,
      isVoid: true,
      isInline: token.type == "html_inline",
      html: token.content,
      children,
    };
  },

  StaticElement,
});
