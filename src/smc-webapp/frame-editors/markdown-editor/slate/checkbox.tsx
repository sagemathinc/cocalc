/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../app-framework";
import {
  RenderElementProps,
  useFocused,
  useSelected,
  useSlate,
} from "slate-react";
import { FOCUSED_COLOR } from "./util";
import { Checkbox as AntCheckbox } from "antd";
import { Transforms } from "slate";

export const Checkbox: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  const focused = useFocused();
  const selected = useSelected();
  const editor = useSlate();

  const border =
    focused && selected ? `1px solid ${FOCUSED_COLOR}` : `1px solid white`;

  return (
    <span {...attributes}>
      <AntCheckbox
        style={{
          border,
          padding: "0 0.2em",
          verticalAlign: "middle",
        }}
        checked={!!element.checked}
        onChange={(e) => {
          Transforms.setNodes(
            editor,
            { checked: e.target.checked },
            { match: (node) => node.type == "checkbox" }
          );
        }}
      />
      {children}
    </span>
  );
};
