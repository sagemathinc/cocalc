/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "smc-webapp/app-framework";
import { FOCUSED_COLOR } from "../util";
import { Editor, Transforms } from "slate";
import {
  SlateElement,
  register,
  useFocused,
  useSelected,
  useSlate,
  RenderElementProps,
} from "./register";

import { Checkbox } from "antd"; // as imports from antd don't work due to tree shaking plugin.
import { useSetElement } from "./set-element";

interface SlateCheckbox extends SlateElement {
  type: "checkbox";
  value?: boolean; // important: using the field value results in more efficient diffs
}

export { SlateCheckbox as Checkbox };

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
    focused && selected ? `1px solid ${FOCUSED_COLOR}` : `1px solid white`;

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
  markdownType: "checkbox_input",

  toSlate: ({ token }) => {
    // NOTE: the checkbox markdown-it plugin that finds the checkboxes in the input
    // markdown is something I also wrote.  It is in smc-webapp/markdown/checkbox-plugin.ts.
    return {
      type: "checkbox",
      isVoid: true,
      isInline: true,
      value: token.checked,
      children: [{ text: "" }],
    };
  },

  Element,

  fromSlate: ({ node }) => `[${node.value ? "x" : " "}]`,
});

// Call this function to toggle the checked state of the checkbox...
// if it is currently selected.  This is called elsewhere in our
// code when user hits the space bar, thus making it possible to
// toggle checkboxes from the keyboard.  Returns true if it toggles
// a checkbox and false otherwise.
export function toggleCheckbox(editor: Editor): boolean {
  const checkbox = Editor.nodes(editor, {
    match: (node) => node["type"] == "checkbox",
    mode: "lowest",
  }).next().value;
  if (checkbox != null && checkbox[0]["type"] == "checkbox") {
    // toggle checkbox checked state
    const value = !checkbox[0]["value"];
    // @ts-ignore
    Transforms.setNodes(editor, { value }, { at: checkbox[1] });
    return true;
  }
  return false;
}
