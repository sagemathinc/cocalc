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

import React from "react";
import { register } from "../register";
import { useSlate } from "../hooks";
import { A } from "@cocalc/frontend/r_misc";
import { useSetElement } from "../set-element";
import { SlateCodeMirror } from "../codemirror";

register({
  slateType: "meta",

  Element: ({ attributes, children, element }) => {
    if (element.type != "meta") throw Error("bug");
    const editor = useSlate();
    const setElement = useSetElement(editor, element);

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
              setElement({ value });
            }}
          />
          <code>---</code>
        </div>
        {children}
      </div>
    );
  },

  fromSlate: ({ node }) => `---\n${node.value}\n---\n`,
});
