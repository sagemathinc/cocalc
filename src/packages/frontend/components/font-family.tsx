/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSSProperties, useMemo } from "react";

import { DropdownMenu } from "@cocalc/frontend/components";
import { FONT_FACES } from "@cocalc/frontend/editors/editor-button-bar";
import { MenuItems } from "./dropdown-menu";

interface Props {
  onClick: (family: string) => void;
  style?: CSSProperties;
  font?: string;
}

export default function FontFamilyMenu(props: Props) {
  const { onClick, style } = props;

  const items: MenuItems = useMemo((): MenuItems => {
    return FONT_FACES.map((family) => {
      return {
        key: family,
        onClick: () => onClick(family),
        label: <span style={{ fontFamily: family }}>{family}</span>,
      };
    });
  }, [onClick]);

  return (
    <DropdownMenu
      style={style}
      button={true}
      title={
        props.font ? (
          <span style={{ fontFamily: props.font }}>{props.font}</span>
        ) : (
          "Sans"
        )
      }
      key={"font-family"}
      items={items}
    />
  );
}
