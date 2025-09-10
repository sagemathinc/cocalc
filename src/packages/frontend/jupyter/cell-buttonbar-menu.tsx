/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import { Button, Dropdown } from "antd";
import copy from "copy-to-clipboard";
import { useIntl } from "react-intl";

import { alert_message } from "@cocalc/frontend/alerts";
import { Icon } from "@cocalc/frontend/components";
import { jupyter, labels } from "@cocalc/frontend/i18n";
import { commands } from "./commands";
import {
  CODE_BAR_BTN_STYLE,
  COPY_CELL_ICON,
  DELETE_CELL_ICON,
  SPLIT_CELL_ICON,
} from "./consts";

export function CodeBarDropdownMenu({ actions, frameActions, id, cell }) {
  const intl = useIntl();

  // All jupyter commands
  const allCommands = commands({
    jupyter_actions: actions,
    frame_actions: frameActions,
  });

  // Extract the cell toolbar command definitions
  const toolbarNone = allCommands["cell toolbar none"];
  const toolbarAssignment = allCommands["cell toolbar create_assignment"];
  const toolbarSlideshow = allCommands["cell toolbar slideshow"];
  const toolbarMetadata = allCommands["cell toolbar metadata"];
  const toolbarAttachments = allCommands["cell toolbar attachments"];
  const toolbarTags = allCommands["cell toolbar tags"];
  const toolbarIds = allCommands["cell toolbar ids"];

  // Helper to format labels safely
  const formatLabel = (cmd) => {
    const message = cmd.menu || cmd.m;
    return typeof message === "string" ? message : intl.formatMessage(message);
  };

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
      key: "undo",
      label: intl.formatMessage(labels.undo),
      icon: <Icon name="undo" />,
      onClick: () => actions.undo(),
    },
    {
      key: "redo",
      label: intl.formatMessage(labels.redo),
      icon: <Icon name="redo" />,
      onClick: () => actions.redo(),
    },
    { key: "divider3", type: "divider" },
    {
      key: "copy",
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.copy-clipboard",
        defaultMessage: "Copy to Clipboard",
      }),
      icon: <Icon name="copy" />,
      onClick: copyToClipboard,
    },
    {
      key: "paste",
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.paste-clipboard",
        defaultMessage: "Paste from Clipboard",
      }),
      icon: <Icon name="paste" />,
      onClick: pasteFromClipboard,
    },
    { key: "divider5", type: "divider" },
    {
      key: "cell-type",
      label: intl.formatMessage(jupyter.commands.cell_type_menu),
      icon: <Icon name="code-outlined" />,
      children: [
        {
          key: "cell-type-code",
          label: intl.formatMessage(jupyter.commands.change_cell_to_code),
          icon: <Icon name="code-outlined" />,
          onClick: () => frameActions.current?.set_selected_cell_type("code"),
        },
        {
          key: "cell-type-markdown",
          label: intl.formatMessage(jupyter.commands.change_cell_to_markdown),
          icon: <Icon name="markdown" />,
          onClick: () =>
            frameActions.current?.set_selected_cell_type("markdown"),
        },
        {
          key: "cell-type-raw",
          label: intl.formatMessage(jupyter.commands.change_cell_to_raw),
          onClick: () => frameActions.current?.set_selected_cell_type("raw"),
        },
      ],
    },
    {
      key: "cell-toolbar",
      label: intl.formatMessage(jupyter.commands.view_toolbars_menu),
      icon: <Icon name="tool" />,
      children: [
        {
          key: "cell-toolbar-none",
          label: formatLabel(toolbarNone),
          icon: <Icon name={toolbarNone.i} />,
          onClick: toolbarNone.f,
        },
        {
          key: "cell-toolbar-create-assignment",
          label: formatLabel(toolbarAssignment),
          icon: <Icon name={toolbarAssignment.i} />,
          onClick: toolbarAssignment.f,
        },
        {
          key: "cell-toolbar-slideshow",
          label: formatLabel(toolbarSlideshow),
          icon: <Icon name={toolbarSlideshow.i} />,
          onClick: toolbarSlideshow.f,
        },
        {
          key: "cell-toolbar-metadata",
          label: formatLabel(toolbarMetadata),
          icon: <Icon name={toolbarMetadata.i} />,
          onClick: toolbarMetadata.f,
        },
        {
          key: "cell-toolbar-attachments",
          label: formatLabel(toolbarAttachments),
          icon: <Icon name={toolbarAttachments.i} />,
          onClick: toolbarAttachments.f,
        },
        {
          key: "cell-toolbar-tags",
          label: formatLabel(toolbarTags),
          icon: <Icon name={toolbarTags.i} />,
          onClick: toolbarTags.f,
        },
        {
          key: "cell-toolbar-ids",
          label: formatLabel(toolbarIds),
          icon: <Icon name={toolbarIds.i} />,
          onClick: toolbarIds.f,
        },
      ],
    },
    { key: "divider4", type: "divider" },
    {
      key: "copy-cell",
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.copy-cell",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Copy Cell",
      }),
      icon: <Icon name={COPY_CELL_ICON} />,
      onClick: () => frameActions.current?.copy_selected_cells(),
    },
    {
      key: "cut",
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.cut-cell",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Cut Cell",
      }),
      icon: <Icon name="cut" />,
      onClick: cut_cell,
    },
    {
      key: "paste-cell-above",
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.paste-cell-above",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Paste Cell Above",
      }),
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
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.paste-cell-below",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Paste Cell Below",
      }),
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
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.duplicate",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Duplicate Cell",
      }),
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
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.delete-cell",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Delete Cell",
      }),
      icon: <Icon name={DELETE_CELL_ICON} />,
      onClick: () => frameActions.current?.delete_selected_cells(),
    },

    { key: "divider6", type: "divider" },
    {
      key: "split-cell",
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.split-cell",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Split Cell at Cursor",
      }),
      icon: <Icon name={SPLIT_CELL_ICON} />,
      onClick: () => {
        frameActions.current?.set_mode("escape");
        frameActions.current?.split_current_cell();
      },
    },
    {
      key: "merge-above",
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.merge-above",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Merge with Cell Above",
      }),
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
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.merge-below",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Merge with Cell Below",
      }),
      icon: (
        <>
          <Icon name="merge-cells-outlined" rotate="90" />
          <Icon name="arrow-down" />
        </>
      ),
      onClick: () => frameActions.current?.merge_cell_below(),
    },
    { key: "divider7", type: "divider" },
    {
      key: "move-cell-up",
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.move-cell-up",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Move Cell Up",
      }),
      icon: <Icon name="arrow-up" />,
      onClick: () => move_cell(-1),
    },
    {
      key: "move-cell-down",
      label: intl.formatMessage({
        id: "jupyter.cell-buttonbar-menu.move-cell-down",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Move Cell Down",
      }),
      icon: <Icon name="arrow-down" />,
      onClick: () => move_cell(1),
    },
  ].map(({ key, label, icon, onClick, children }) => {
    return {
      key,
      label,
      onClick,
      icon: <span style={{ width: "24px" }}>{icon}</span>,
      children,
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
