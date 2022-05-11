/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { FOCUSED_COLOR } from "../../util";
import { Editor, Transforms } from "slate";
import { register, RenderElementProps } from "../register";
import { useFocused, useSelected, useSlate } from "../hooks";
import { Checkbox } from "antd";
import { useSetElement } from "../set-element";

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  if (element.type != "checkbox") {
    throw Error("bug");
  }
  const focused = useFocused();
  const selected = useSelected();
  const editor = useSlate();
  const setElement = useSetElement(editor, element);

  const border =
    focused && selected
      ? `1px solid ${FOCUSED_COLOR}`
      : `1px solid transparent`;

  return (
    <span {...attributes}>
      <Checkbox
        style={{
          border,
          padding: "0 0.2em 0.2em 0.2em",
          verticalAlign: "middle",
        }}
        checked={!!element.value}
        onChange={(e) => {
          setElement({ value: e.target.checked });
        }}
      />
      {children}
    </span>
  );
};

register({
  slateType: "checkbox",
  Element,
  fromSlate: ({ node }) => `[${node.value ? "x" : " "}]`,
});

// Call this function to toggle the checked state of the checkbox...
// if it is currently selected.  This is called elsewhere in our
// code when user hits the space bar, thus making it possible to
// toggle checkboxes from the keyboard.  Returns true if it toggles
// a checkbox and false otherwise.
export function toggleCheckbox(editor: Editor): boolean {
  let checkbox;
  try {
    checkbox = Editor.nodes(editor, {
      match: (node) => node["type"] == "checkbox",
      mode: "lowest",
    }).next().value;
  } catch (_) {
    // this happens, when e.g., next() doesn't work due to
    // change in document/focus wrt to what editor assumes.
    return false;
  }
  if (checkbox != null && checkbox[0]["type"] == "checkbox") {
    // toggle checkbox checked state
    const value = !checkbox[0]["value"];
    // @ts-ignore
    Transforms.setNodes(editor, { value }, { at: checkbox[1] });
    return true;
  }
  return false;
}
