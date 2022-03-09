/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { FOCUSED_COLOR } from "../../util";
import { register } from "../register";
import { useFocused, useSelected } from "../hooks";

register({
  slateType: "emoji",

  Element: ({ attributes, children, element }) => {
    if (element.type != "emoji") throw Error("bug");
    const focused = useFocused();
    const selected = useSelected();

    const border =
      focused && selected ? `1px solid ${FOCUSED_COLOR}` : `1px solid transparent`;

    return (
      <span {...attributes} style={{ border }}>
        {element.content}
        {children}
      </span>
    );
  },
  fromSlate: ({ node }) => `:${node.markup}:`,
});
