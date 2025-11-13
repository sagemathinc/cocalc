/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import HeadingMenu from "@cocalc/frontend/components/heading-menu";
import { formatAction } from "../format";
import { BUTTON_STYLE } from "./marks-bar";

export default function Component({ editor }) {
  return (
    <HeadingMenu
      markdown
      style={{ ...BUTTON_STYLE, height: "24px", width: "46px", padding: 0 }}
      onClick={(heading) => {
        formatAction(editor, `format_heading_${heading}`, []);
      }}
    />
  );
}
