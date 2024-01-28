/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The format bar.
*/

import {  ButtonGroup } from "@cocalc/frontend/antd-bootstrap";
import { React, Rendered } from "@cocalc/frontend/app-framework";
import { ColorButton } from "@cocalc/frontend/components/color-picker";
import FontFamilyMenu from "@cocalc/frontend/components/font-family";
import FontSizeMenu from "@cocalc/frontend/components/font-size";
import HeadingMenu from "@cocalc/frontend/components/heading-menu";
import { SetMap } from "./types";

interface Props {
  actions: any; // type of file being edited, which impacts what buttons are shown.
  exclude?: SetMap; // exclude buttons with these names
}

function shouldMemoize() {
  return true;
}

export const FormatBar: React.FC<Props> = React.memo((props: Props) => {
  const { actions, exclude } = props;

  function render_font_family_dropdown(): Rendered {
    return (
      <FontFamilyMenu
        onClick={(family) => actions.format_action("font_family", family)}
      />
    );
  }

  function render_font_size_dropdown(): Rendered {
    return (
      <FontSizeMenu
        onClick={(size) => actions.format_action("font_size_new", size)}
      />
    );
  }

  function render_heading_dropdown(): Rendered {
    return (
      <HeadingMenu
        onClick={(heading) =>
          actions.format_action(`format_heading_${heading}`)
        }
      />
    );
  }

  function render_colors_dropdown(): Rendered {
    return (
      <ColorButton onChange={(code) => actions.format_action("color", code)} />
    );
  }

  if (exclude?.["font_dropdowns"]) {
    return null;
  }
  return (
    <ButtonGroup key={"font-dropdowns"}>
      {render_font_family_dropdown()}
      {render_font_size_dropdown()}
      {render_heading_dropdown()}
      {render_colors_dropdown()}
    </ButtonGroup>
  );
}, shouldMemoize);
