/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import { Button, Dropdown } from "antd";
import copy from "copy-to-clipboard";

import { alert_message } from "@cocalc/frontend/alerts";
import { Icon } from "@cocalc/frontend/components";
import {
  CODE_BAR_BTN_STYLE,
  COPY_CELL_ICON,
  DELETE_CELL_ICON,
  SPLIT_CELL_ICON,
} from "./consts";

export function CodeBarDropdownMenu({ actions, frameActions, id, cell }) {
  function cut_cell(): void {
    if (id == null) return;
    frameActions.current?.unselect_all_cells();
    frameActions.current?.select_cell(id);
    frameActions.current?.cut_selected_cells();
  }

  function move_cell(delta: -1 | 1): void {
    if (id == null) return;
    frameActions.current?.unselect_all_cells();
    frameActions.current?.select_cell(id);
    frameActions.current?.move_selected_cells(delta);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      frameActions.current?.set_cell_input(id, text);
    } catch (err) {
      alert_message({
        type: "error",
        title: "Permission denied",
        message: `You have to enable clipboard access to make pasting from the clipboard work.\n${err}`,
      });
    }
  }

  async function copyToClipboard() {
    const text = cell.get("input") ?? "";
    copy(text);
  }

  if (actions == null) return null;

  const items: MenuProps["items"] = [
    {
      key: "copy",
      label: "Copy to Clipboard",
      icon: <Icon name="copy" />,
      onClick: copyToClipboard,
    },
    {
      key: "paste",
      label: "Paste from Clipboard",
      icon: <Icon name="paste" />,
      onClick: pasteFromClipboard,
    },
    { key: "divider3", type: "divider" },
    {
      key: "undo",
      label: "Undo",
      icon: <Icon name="undo" />,
      onClick: () => actions.undo(),
    },
    {
      key: "redo",
      label: "Redo",
      icon: <Icon name="redo" />,
      onClick: () => actions.redo(),
    },
    { key: "divider4", type: "divider" },
    {
      key: "copy-cell",
      label: "Copy Cell",
      icon: <Icon name={COPY_CELL_ICON} />,
      onClick: () => frameActions.current?.copy_selected_cells(),
    },
    {
      key: "cut",
      label: "Cut Cell",
      icon: <Icon name="cut" />,
      onClick: cut_cell,
    },
    {
      key: "paste-cell-above",
      label: "Paste Cell Above",
      icon: (
        <>
          <Icon name={"paste"} />
          <Icon name="arrow-up" />
        </>
      ),
      onClick: () => frameActions.current?.paste_cells(-1),
    },
    {
      key: "paste-cell-below",
      label: "Paste Cell Below",
      icon: (
        <>
          <Icon name={"paste"} />
          <Icon name="arrow-down" />
        </>
      ),
      onClick: () => frameActions.current?.paste_cells(1),
    },
    {
      key: "duplicate",
      label: "Duplicate Cell",
      icon: <Icon name="fork-outlined" rotate="90" />,
      onClick: async () => {
        frameActions.current?.copy_selected_cells();
        frameActions.current?.paste_cells(1);
        await new Promise((resolve) => setTimeout(resolve, 1));
        frameActions.current?.move_cursor_after(id);
      },
    },
    {
      key: "delete-cell",
      label: "Delete Cell",
      icon: <Icon name={DELETE_CELL_ICON} />,
      onClick: () => frameActions.current?.delete_selected_cells(),
    },
    { key: "divider5", type: "divider" },
    {
      key: "split-cell",
      label: "Split Cell at Cursor",
      icon: <Icon name={SPLIT_CELL_ICON} />,
      onClick: () => {
        frameActions.current?.set_mode("escape");
        frameActions.current?.split_current_cell();
      },
    },
    {
      key: "merge-above",
      label: "Merge with Cell Above",
      icon: (
        <>
          <Icon name="merge-cells-outlined" rotate="90" />
          <Icon name="arrow-up" />
        </>
      ),
      onClick: () => frameActions.current?.merge_cell_above(),
    },
    {
      key: "merge-below",
      label: "Merge with Cell Below",
      icon: (
        <>
          <Icon name="merge-cells-outlined" rotate="90" />
          <Icon name="arrow-down" />
        </>
      ),
      onClick: () => frameActions.current?.merge_cell_below(),
    },
    { key: "divider6", type: "divider" },
    {
      key: "move-cell-up",
      label: "Move Cell Up",
      icon: <Icon name="arrow-up" />,
      onClick: () => move_cell(-1),
    },
    {
      key: "move-cell-down",
      label: "Move Cell Down",
      icon: <Icon name="arrow-down" />,
      onClick: () => move_cell(1),
    },
  ].map(({ key, label, icon, onClick }) => {
    return {
      key,
      label,
      onClick,
      icon: <span style={{ width: "24px" }}>{icon}</span>,
    };
  });

  return (
    <Dropdown
      menu={{ items, style: { maxHeight: "50vh", overflow: "auto" } }}
      arrow
      trigger={["click"]}
      mouseLeaveDelay={1.5}
      overlayClassName={"cc-jupyter-buttonbar-dropdown"}
    >
      <Button type="text" size="small" style={CODE_BAR_BTN_STYLE}>
        <Icon name="ellipsis" rotate="90" style={{ fontSize: "20px" }} />
      </Button>
    </Dropdown>
  );
}
