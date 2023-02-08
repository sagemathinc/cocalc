/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import FontFamilyMenu from "@cocalc/frontend/components/font-family";
import { formatAction } from "../format";
import { BUTTON_STYLE } from "./marks-bar";

export default function Component({ editor }) {
  return (
    <FontFamilyMenu
      style={{ ...BUTTON_STYLE, height: "24px", width: "46px", padding: 0 }}
      onClick={(font_family) => {
        formatAction(editor, "font_family", font_family);
      }}
    />
  );
}
