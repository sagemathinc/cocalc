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

import { React } from "smc-webapp//app-framework";
import { register, SlateElement, useSlate } from "./register";
import { SlateCodeMirror } from "./codemirror";
import { Transforms } from "slate";
import { A } from "smc-webapp/r_misc";

export interface Meta extends SlateElement {
  type: "meta";
  value: string;
  isVoid: true;
}

export function createMetaNode(value: string) {
  return {
    type: "meta" as "meta",
    value,
    isVoid: true as true,
    children: [{ text: "" }],
  };
}

register({
  slateType: "meta",

  fromSlate: ({ node }) => `---\n${node.value}\n---\n`,

  Element: ({ attributes, children, element }) => {
    if (element.type != "meta") throw Error("bug");
    const editor = useSlate();

    return (
      <div {...attributes}>
        <div contentEditable={false}>
          <span style={{ float: "right" }}>
            <A href="https://docs.ansible.com/ansible/latest/reference_appendices/YAMLSyntax.html">
              YAML
            </A>{" "}
            Header
          </span>
          <code>---</code>
          <SlateCodeMirror
            style={{ marginBottom: 0 }}
            info="yml"
            options={{ lineWrapping: true }}
            value={element.value}
            onChange={(value) => {
              Transforms.setNodes(editor, { value } as any, {
                match: (node) => node["type"] == "meta",
              });
            }}
          />
          <code>---</code>
        </div>
        {children}
      </div>
    );
  },

  toSlate: ({ token }) => {
    return createMetaNode(token.content);
  },
});
