/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { SlateElement, register, RenderElementProps } from "../register";
import { Checkbox as AntdCheckbox } from "antd";

export interface Checkbox extends SlateElement {
  type: "checkbox";
  value?: boolean; // important: using the field value results in more efficient diffs
}

interface Props extends RenderElementProps {
  setElement?: (SlateElement) => void;
}

function StaticElement({ attributes, children, element, setElement }: Props) {
  if (element.type != "checkbox") {
    throw Error("bug");
  }
  return (
    <span {...attributes}>
      <AntdCheckbox
        style={{
          padding: "0 0.2em 0.2em 0.2em",
          verticalAlign: "middle",
          border: "1px solid transparent",
        }}
        checked={!!element.value}
        disabled={setElement == null}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onChange={
          setElement == null
            ? undefined
            : () => {
                setElement({ value: !element.value });
              }
        }
      />
      {children}
    </span>
  );
}

register({
  slateType: "checkbox",
  markdownType: "checkbox_input",
  toSlate: ({ token }) => {
    return {
      type: "checkbox",
      isVoid: true,
      isInline: true,
      value: token.checked,
      children: [{ text: "" }],
    };
  },

  StaticElement,
});
