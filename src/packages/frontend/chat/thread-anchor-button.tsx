/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import type { ChatActions } from "./actions";

interface Props {
  anchorId: string;
  actions: ChatActions;
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

  return (
    <Tooltip title="Jump to this anchor in the source">
      <Button
        style={BUTTON_STYLE}
        icon={<Icon name="comment" />}
        onClick={() => editorActions.jumpToAnchor(anchorId)}
      >
        {label}
      </Button>
    </Tooltip>
  );
}
