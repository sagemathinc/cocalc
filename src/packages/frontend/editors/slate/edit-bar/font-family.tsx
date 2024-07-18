/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import FontFamilyMenu from "@cocalc/frontend/components/font-family";
import { formatAction } from "../format";
import { BUTTON_STYLE } from "./marks-bar";

export default function Component({ editor, font }) {
  return (
    <FontFamilyMenu
      style={{
        ...BUTTON_STYLE,
        height: "24px",
        padding: "0px 0px 0px 2.5px",
        fontSize: "13px",
      }}
      onClick={(font_family) => {
        formatAction(editor, "font_family", font_family);
      }}
      font={font}
    />
  );
}
