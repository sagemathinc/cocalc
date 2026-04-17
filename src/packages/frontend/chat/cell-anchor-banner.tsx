/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import { useAppContext } from "@cocalc/frontend/app/context";
import type { ChatActions } from "./actions";

interface Props {
  cellId: string;
  actions: ChatActions;
}

export function CellAnchorButton({ cellId, actions }: Props) {
  const { isDark } = useAppContext();
  const editorActions = actions.frameTreeActions as any;
  const store = editorActions?.jupyter_actions?.store;
  const cellList = store?.get("cell_list");
  const idx = cellList?.indexOf(cellId) ?? -1;
  if (idx < 0) return null;

  return (
    <Tooltip title="Jump to this cell in the notebook">
      <Button
        style={{
          background: isDark
            ? "rgba(var(--cocalc-primary-rgb, 66, 165, 245), 0.3)"
            : "rgba(var(--cocalc-primary-rgb, 66, 165, 245), 0.1)",
          borderColor: isDark
            ? "rgba(var(--cocalc-primary-rgb, 66, 165, 245), 0.45)"
            : "var(--cocalc-primary-light, #94B3E5)",
          color: isDark
            ? "var(--cocalc-text-on-primary, #fff)"
            : "var(--cocalc-primary-dark, #2A5AA6)",
          fontWeight: 500,
          boxShadow: "none",
        }}
        onClick={() => editorActions?.jump_to_cell?.(cellId)}
      >
        Cell #{idx + 1}
      </Button>
    </Tooltip>
  );
}
