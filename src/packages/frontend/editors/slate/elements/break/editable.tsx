/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register } from "../register";
import { useCollapsed, useFocused, useSelected } from "../hooks";

register({
  slateType: "softbreak",

  // A softbreak creates a new line without creating
  // a new paragraph.
  Element: ({ attributes, children }) => {
    const focused = useFocused();
    const selected = useSelected();
    const collapsed = useCollapsed();
    const reveal = focused && selected && collapsed;
    return (
      <span {...attributes}>
        <span
          style={{
            whiteSpace: "normal",
            borderRight: reveal ? "1px solid #333" : undefined,
            color: reveal ? "lightgrey" : undefined,
          }}
          contentEditable={false}
        >
          {reveal ? "↵\n" : " "}
        </span>
        {children}
      </span>
    );
  },

  fromSlate: ({ children }) => {
    // Just in case somehow the children were edited
    // (it doesn't seem they can be), we still won't
    // loose information:
    return children + "\n";
  },
});

register({
  slateType: "hardbreak",

  fromSlate: ({ children }) => {
    return children + "  \n";
  },

  Element: ({ attributes, children }) => {
    const focused = useFocused();
    const selected = useSelected();
    const collapsed = useCollapsed();
    const reveal = focused && selected && collapsed;
    return (
      <span {...attributes}>
        <span
          style={{
            whiteSpace: "pre",
            borderRight: reveal ? "1px solid #333" : undefined,
            color: reveal ? "lightgrey" : undefined,
          }}
          contentEditable={false}
        >
          {reveal ? "↵\n" : "\n"}
        </span>
        {children}
      </span>
    );
  },
});
