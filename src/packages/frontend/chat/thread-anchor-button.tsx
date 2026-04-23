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
  const label: string =
    editorActions.getAnchorLabel?.(anchorId) ?? "Jump to anchor";

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
