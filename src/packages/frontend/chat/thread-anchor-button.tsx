/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import type { ChatActions } from "./actions";

interface Props {
  anchorId: string;
  actions: ChatActions;
}

interface AnchorLocation {
  path?: string;
  line?: number;
  label?: string;
}

const BUTTON_STYLE = {
  background: COLORS.BLUE_LLL,
  borderColor: COLORS.BLUE_LL,
  color: COLORS.BLUE_D,
} as const;

export function ThreadAnchorButton({ anchorId, actions }: Props) {
  const editorActions = actions.frameTreeActions as any;
  if (!editorActions || typeof editorActions.jumpToAnchor !== "function") {
    return null;
  }
  const label: string =
    editorActions.getAnchorLabel?.(anchorId) ?? "Jump to anchor";
  const locations: AnchorLocation[] =
    editorActions.getAnchorLocations?.(anchorId) ?? [];

  if (locations.length <= 1) {
    return (
      <Tooltip title="Jump to this anchor in the source">
        <Button
          style={BUTTON_STYLE}
          icon={<Icon name="comment" />}
          onClick={() => editorActions.jumpToAnchor(anchorId, 0)}
        >
          {label}
        </Button>
      </Tooltip>
    );
  }

  const items: MenuProps["items"] = locations.map((loc, i) => {
    const bits: string[] = [];
    if (loc.label) bits.push(loc.label);
    if (loc.path) bits.push(loc.path.split("/").pop() ?? loc.path);
    if (typeof loc.line === "number" && loc.line >= 0) {
      bits.push(`line ${loc.line + 1}`);
    }
    return {
      key: `${i}`,
      label: bits.length > 0 ? bits.join(" · ") : `Location ${i + 1}`,
      onClick: () => editorActions.jumpToAnchor(anchorId, i),
    };
  });

  return (
    <Tooltip title={`${locations.length} locations — pick one`}>
      <Dropdown menu={{ items }} trigger={["click"]}>
        <Button style={BUTTON_STYLE} icon={<Icon name="comment" />}>
          {label}
        </Button>
      </Dropdown>
    </Tooltip>
  );
}
