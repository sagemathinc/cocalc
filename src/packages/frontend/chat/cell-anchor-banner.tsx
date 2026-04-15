/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import type { ChatActions } from "./actions";

interface Props {
  cellId: string;
  actions: ChatActions;
}

export function CellAnchorButton({ cellId, actions }: Props) {
  const editorActions = actions.frameTreeActions as any;
  const store = editorActions?.jupyter_actions?.store;
  const cellList = store?.get("cell_list");
  const idx = cellList?.indexOf(cellId) ?? -1;
  if (idx < 0) return null;

  return (
    <Tooltip title="Jump to this cell in the notebook">
      <Button
        style={{
          background: "var(--cocalc-bg-selected, #c7d9f5)",
          borderColor: "var(--cocalc-primary-light, #94B3E5)",
          color: "var(--cocalc-primary-dark, #2A5AA6)",
        }}
        onClick={() => editorActions?.jump_to_cell?.(cellId)}
      >
        Cell #{idx + 1}
      </Button>
    </Tooltip>
  );
}
