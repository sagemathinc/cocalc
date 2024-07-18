/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ColorButton } from "@cocalc/frontend/components/color-picker";
import { formatAction } from "../format";
import { SlateEditor } from "../types";
import { BUTTON_STYLE } from "./marks-bar";

interface Props {
  editor: SlateEditor;
  color?: string;
}

export default function Component(props: Props) {
  const { editor, color } = props;

  return (
    <ColorButton
      type="text"
      style={{ ...BUTTON_STYLE, background: color }}
      onChange={(color) => {
        formatAction(editor, "color", color);
      }}
      onClick={() => {
        if (color) {
          formatAction(editor, "color", null);
          return true;
        }
      }}
    />
  );
}
