/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import { COLORS } from "@cocalc/util/theme";
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
          background: COLORS.BLUE_LLL,
          borderColor: COLORS.BLUE_LL,
          color: COLORS.BLUE_D,
        }}
        onClick={() => editorActions?.jump_to_cell?.(cellId)}
      >
        Cell #{idx + 1}
      </Button>
    </Tooltip>
  );
}
