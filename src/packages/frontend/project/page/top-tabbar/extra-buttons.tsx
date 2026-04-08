/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { ReactNode } from "react";
import { Button } from "antd";

import { Icon } from "@cocalc/frontend/components";
import { DropdownMenu } from "@cocalc/frontend/components/dropdown-menu";
import type { TopBarActionsData } from "./types";

const BUTTON_STYLE = { fontSize: "14pt", padding: "0 5px" } as const;

const BUTTON_ICON = (<Icon name="ellipsis" rotate="90" />) as ReactNode;

interface ExtraButtonsProps {
  actionsData: TopBarActionsData | null;
}

export function ExtraButtons(props: Readonly<ExtraButtonsProps>): ReactNode {
  const { actionsData } = props;

  if (actionsData == null || actionsData.menuItems.length === 0) {
    // Render a same-size placeholder so the toolbar doesn't jump
    return (
      <Button type="text" disabled style={{ visibility: "hidden", ...BUTTON_STYLE }}>
        {BUTTON_ICON}
      </Button>
    );
  }

  return (
    <DropdownMenu
      items={actionsData.menuItems}
      title={BUTTON_ICON}
      style={BUTTON_STYLE}
    />
  );
}
