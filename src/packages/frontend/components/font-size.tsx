/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSSProperties, useMemo } from "react";

import { DropdownMenu, Icon } from "@cocalc/frontend/components";
import { FONT_SIZES } from "@cocalc/frontend/editors/editor-button-bar";
import { MenuItems } from "./dropdown-menu";

interface Props {
  onClick: (family: string) => void;
  style?: CSSProperties;
}

export default function FontSizeMenu({ onClick, style }: Props) {
  const items: MenuItems = useMemo(() => {
    return FONT_SIZES.map((size) => {
      return {
        key: size,
        onClick: () => onClick(size),
        label: (
          <span style={{ fontSize: size }}>
            {size} {size === "medium" ? "(default)" : undefined}
          </span>
        ),
      };
    });
  }, [onClick]);

  return (
    <DropdownMenu
      style={style}
      button={true}
      title={<Icon name={"text-height"} />}
      key={"font-size"}
      items={items}
    />
  );
}
