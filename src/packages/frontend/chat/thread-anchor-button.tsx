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
  // Prefer the location-only label (`path:line`); the opaque hash is
  // not useful in a "Jump to ..." button. Fall back to the full label
  // (which includes the hash) only when no jump-label is available, and
  // finally to a bare "Jump to anchor".
  const jumpTarget: string | undefined =
    editorActions.getAnchorJumpLabel?.(anchorId) ??
    editorActions.getAnchorLabel?.(anchorId);
  const label = jumpTarget ? `Jump to ${jumpTarget}` : "Jump to anchor";

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
