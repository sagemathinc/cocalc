/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*

YAML metadata node, e.g., at the VERY top like this:

---
title: HW02
subtitle: Basic Rmd and Statistics
output:
  html_document:
    theme: spacelab
    highlight: tango
    toc: true
---


*/

import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { register } from "../register";
import infoToMode from "../code-block/info-to-mode";
import { Meta, createMetaNode } from "./type";
export type { Meta };
export { createMetaNode };

register({
  slateType: "meta",

  toSlate: ({ token }) => {
    return createMetaNode(token.content);
  },

  StaticElement: ({ attributes, element }) => {
    if (element.type != "meta") throw Error("bug");
    return (
      <div {...attributes}>
        <code>---</code>
        <CodeMirrorStatic
          style={{ marginBottom: 0 }}
          options={{ mode: infoToMode("yml"), lineWrapping: true }}
          value={element.value}
        />
        <code>---</code>
      </div>
    );
  },
});
