/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useEffect, useRef, useState } from "react";
import { register } from "../register";
import { Details } from "./index";
import { useSlate } from "../hooks";
import { useSetElement } from "../set-element";

import { STYLE } from "./index";

register({
  slateType: "details",

  Element: ({ attributes, children, element }) => {
    const node = element as Details;
    const ref = useRef<any>();
    const [open, setOpen] = useState<boolean>(!!node.open);
    useEffect(() => {
      if (open != node.open) {
        setOpen(!!node.open);
      }
    }, [node.open]);
    const editor = useSlate();
    const setElement = useSetElement(editor, element);
    const details = (
      <details
        ref={ref}
        style={STYLE}
        open={open}
        onToggle={() => {
          if (ref.current?.open != open) {
            setOpen(!open);
            setElement({ open: !open });
          }
        }}
      >
        {node.summary /* whiteSpace inherits something weird from some css */ && (
          <summary contentEditable={false} style={{ whiteSpace: "normal" }}>
            {node.summary}
          </summary>
        )}
        {children}
      </details>
    );
    return node.isInline ? (
      <span {...attributes}>{details}</span>
    ) : (
      <div {...attributes}>{details}</div>
    );
  },

  fromSlate: ({ node, children }) => {
    return `<details${node.open ? " open" : ""}>${
      node.summary ? "\n  <summary>" + node.summary + "</summary>" : ""
    }${node.isInline ? "" : "\n\n"}${children.trim()}${
      node.isInline ? "" : "\n\n"
    }</details>${node.isInline ? "" : "\n\n"}`;
  },
});
