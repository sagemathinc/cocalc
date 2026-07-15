/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import { useAppContext } from "@cocalc/frontend/app/context";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import type { ChatActions } from "./actions";

interface Props {
  anchorId: string;
  actions: ChatActions;
}

export function ThreadAnchorButton({ anchorId, actions }: Props) {
  const { isDark } = useAppContext();
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

  const style = {
    background: isDark
      ? `rgba(var(--cocalc-primary-rgb, 66, 165, 245), 0.3)`
      : `rgba(var(--cocalc-primary-rgb, 66, 165, 245), 0.1)`,
    borderColor: isDark
      ? `rgba(var(--cocalc-primary-rgb, 66, 165, 245), 0.45)`
      : `var(--cocalc-primary-light, ${COLORS.BLUE_LL})`,
    color: isDark
      ? `var(--cocalc-text-on-primary, #fff)`
      : `var(--cocalc-primary-dark, ${COLORS.BLUE_D})`,
    fontWeight: 500,
    boxShadow: "none",
  } as const;

  return (
    <Tooltip title="Jump to this anchor in the source">
      <Button
        style={style}
        icon={<Icon name="comment" />}
        onClick={() => editorActions.jumpToAnchor(anchorId)}
      >
        {label}
      </Button>
    </Tooltip>
  );
}
