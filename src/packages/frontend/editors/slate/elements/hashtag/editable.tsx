/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register } from "../register";
import { useFocused, useSelected } from "../hooks";
import Hashtag from "./component";

register({
  slateType: "hashtag",

  Element: ({ attributes, children, element }) => {
    if (element.type != "hashtag") throw Error("bug");
    const focused = useFocused();
    const selected = useSelected();

    return (
      <span {...attributes}>
        <Hashtag value={element.content} selected={focused && selected} />
        {children}
      </span>
    );
  },

  fromSlate: ({ node }) => `#${node.content}`,
});
