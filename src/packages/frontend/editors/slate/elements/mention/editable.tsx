/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* We want mentions to be represented in the markdown like this:

   <span class="user-mention" account-id=47d0393e-4814-4452-bb6c-35bac4cbd314 >@Bella Welski</span>

because then they will be compatible with all mentions already used with chat and tasks.
*/

import { trunc_middle as truncMiddle } from "@cocalc/util/misc";
import { redux } from "@cocalc/frontend/app-framework";
import { FOCUSED_COLOR } from "../../util";
import { register, RenderElementProps } from "../register";
import { useFocused, useSelected } from "../hooks";
import { createMentionStatic } from "./index";

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  if (element.type != "mention") {
    throw Error("bug");
  }
  const focused = useFocused();
  const selected = useSelected();

  const border =
    focused && selected ? `1px solid ${FOCUSED_COLOR}` : `1px solid transparent`;

  return (
    <span {...attributes}>
      <span contentEditable={false} className="user-mention" style={{ border }}>
        @{element.name}
      </span>
      {children}
    </span>
  );
};

export function createMention(account_id: string, name?: string) {
  if (name == null) {
    name = truncMiddle(redux.getStore("users").get_name(account_id), 64);
  }
  return createMentionStatic(account_id, name);
}

register({
  slateType: "mention",

  toSlate: ({ token }) => {
    const { account_id, name } = token;
    return createMention(account_id, name);
  },

  Element,

  fromSlate: ({ node }) =>
    `<span class="user-mention" account-id=${node.account_id}>@${node.name}</span>`,
});
