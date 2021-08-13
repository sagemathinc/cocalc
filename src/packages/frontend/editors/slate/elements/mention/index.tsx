/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* We want mentions to be represented in the markdown like this:

   <span class="user-mention" account-id=47d0393e-4814-4452-bb6c-35bac4cbd314 >@Bella Welski</span>

because then they will be compatible with all mentions already used with chat and tasks.
*/

import React from "react";
import { SlateElement, register, RenderElementProps } from "../register";

export interface Mention extends SlateElement {
  type: "mention";
  account_id: string;
  name: string;
  isInline: true;
  isVoid: true;
}

const STYLE = {
  color: "#7289da",
  background: "rgba(114,137,218,.1)",
  borderRadius: "3px",
  padding: "0 2px",
} as React.CSSProperties;

const StaticElement: React.FC<RenderElementProps> = ({
  attributes,
  element,
}) => {
  if (element.type != "mention") {
    throw Error("bug");
  }
  return (
    <span {...attributes} style={STYLE}>
      @{element.name}
    </span>
  );
};

export function createMentionStatic(account_id: string, name?: string) {
  if (name == null) {
    name = "User";
  }
  return {
    type: "mention" as "mention",
    isVoid: true as true,
    isInline: true as true,
    account_id,
    name: name as string,
    children: [{ text: "" }],
  };
}

register({
  slateType: "mention",

  toSlate: ({ token }) => {
    const { account_id, name } = token;
    return createMentionStatic(account_id, name);
  },

  StaticElement,
});
