/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
React component that describes the input of a cell
*/

import { Button, Dropdown, Tooltip } from "antd";
import { delay } from "awaiting";
import { Map } from "immutable";
import React, { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { useFrameContext } from "@cocalc/frontend/app-framework";
import { Icon, isIconName } from "@cocalc/frontend/components";
import ComputeServer from "@cocalc/frontend/compute/inline";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { jupyter, labels } from "@cocalc/frontend/i18n";
import track from "@cocalc/frontend/user-tracking";
import { LLMTools } from "@cocalc/jupyter/types";
import { CellType } from "@cocalc/util/jupyter/types";
import { JupyterActions } from "./browser-actions";
import { CodeBarDropdownMenu } from "./cell-buttonbar-menu";
import { CellIndexNumber } from "./cell-index-number";
import CellTiming from "./cell-output-time";
import {
  CODE_BAR_BTN_STYLE,
  MINI_BUTTONS_STYLE_INNER,
  RUN_ALL_CELLS_ABOVE_ICON,
  RUN_ALL_CELLS_BELOW_ICON,
} from "./consts";
import { LLMCellTool } from "./llm/cell-tool";

interface Props {
  id: string;
  cell_type: CellType;
  actions?: JupyterActions;
  cell: Map<string, any>;
  is_current: boolean;
  computeServerId?: number;
  llmTools?: LLMTools;
  haveLLMCellTools: boolean; // decides if we show the LLM Tools, depends on student project in a course, etc.
  index: number;
  is_readonly: boolean;
  input_is_readonly?: boolean;
}

function areEqual(prev: Props, next: Props): boolean {
  return !(
    next.id !== prev.id ||
    next.cell_type !== prev.cell_type ||
    next.index !== prev.index ||
    next.cell !== prev.cell ||
    next.is_current !== prev.is_current ||
    next.computeServerId !== prev.computeServerId ||
    (next.llmTools?.model ?? "") !== (prev.llmTools?.model ?? "") ||
    next.is_current !== prev.is_current ||
    next.is_readonly !== prev.is_readonly ||
    next.haveLLMCellTools !== prev.haveLLMCellTools
  );
}

export const CellButtonBar: React.FC<Props> = React.memo(
  ({
    id,
    cell_type,
    actions,
    cell,
    is_current,
    computeServerId,
    llmTools,
    index,
    is_readonly,
    input_is_readonly,
    haveLLMCellTools,
  }: Props) => {
    const intl = useIntl();

    const { project_id, path } = useFrameContext();
    const frameActions = useNotebookFrameActions();
    const [formatting, setFormatting] = useState<boolean>(false);

    const isCodeCell = cell_type === "code";
    const isMarkdownCell = cell_type === "markdown";

    function trackButton(button: string) {
      track("jupyter_cell_buttonbar", { button, project_id, path });
    }

    function getRunStopButton(): {
      tooltip: string;
      icon: string;
      label: string;
      isRunning: boolean;
      onClick: () => void;
    } {
      const isRunning =
        cell.get("state") === "busy" ||
        cell.get("state") === "run" ||
        cell.get("state") === "start";

      if (isRunning) {
        return {
          tooltip: "Stop this cell",
          icon: "stop",
          label: "Stop",
          isRunning: true,
          onClick: () => actions?.signal("SIGINT"),
        };
      }

      return {
        tooltip: "Run this cell",
        label: "Run",
        icon: "step-forward",
        isRunning: false,
        onClick: () => frameActions.current?.run_cell(id),
      };
    }

    function renderCodeBarRunStop() {
      if (
        !(isCodeCell || isMarkdownCell) ||
        id == null ||
        actions == null ||
        actions.is_closed() ||
        is_readonly
      ) {
        return;
      }

      const { label, icon, tooltip, onClick, isRunning } = getRunStopButton();

      // ATTN: this must be wrapped in a plain div, otherwise it's own flex & width 100% style disturbs the button bar
      return (
        <div>
          <Dropdown.Button
            size="small"
            type="text"
            trigger={["click"]}
            mouseLeaveDelay={1.5}
            icon={<Icon name="angle-down" />}
            onClick={onClick}
            menu={{
              items: [
                {
                  key: "all-above",
                  icon: <Icon name={RUN_ALL_CELLS_ABOVE_ICON} />,
                  label: intl.formatMessage(
                    jupyter.commands.run_all_cells_above_menu,
                  ),
                  onClick: () => actions?.run_all_above_cell(id),
                },
                {
                  key: "all-below",
                  icon: <Icon name={RUN_ALL_CELLS_BELOW_ICON} rotate={"90"} />,
                  label: intl.formatMessage(
                    jupyter.commands.run_all_cells_below_menu,
                  ),
                  onClick: () => actions?.run_all_below_cell(id),
                },
              ],
            }}
            aria-label={`${label} cell${isRunning ? " (running)" : ""}, dropdown menu: run all above, run all below`}
            aria-haspopup="menu"
          >
            <Tooltip placement="top" title={tooltip}>
              <span style={CODE_BAR_BTN_STYLE}>
                {isIconName(icon) && <Icon name={icon} />} {label}
              </span>
            </Tooltip>
          </Dropdown.Button>
        </div>
      );
    }

    function renderCodeBarComputeServer() {
      if (!is_current || !isCodeCell || !computeServerId || is_readonly) return;
      return <ComputeServerPrompt id={computeServerId} />;
    }

    function renderCodeBarCellTiming() {
      if (!isCodeCell) return;
      return (
        <div style={{ margin: "2.5px 4px 4px 10px" }}>
          <CellTiming
            start={cell.get("start")}
            end={cell.get("end")}
            last={cell.get("last")}
            state={cell.get("state")}
            isLive={!is_readonly && actions != null}
            kernel={cell.get("kernel")}
          />
        </div>
      );
    }

    function renderCodeBarLLMButtons() {
      if (!llmTools || !haveLLMCellTools || is_readonly) return;
      return (
        <LLMCellTool
          id={id}
          actions={actions}
          llmTools={llmTools}
          cellType={isCodeCell ? "code" : "markdown"}
        />
      );
    }

    function renderCodeBarFormatButton() {
      // Should only show formatter button if there is a way to format this code.
      if (!isCodeCell || is_readonly || actions == null || input_is_readonly) {
        return;
      }
      return (
        <Tooltip
          title={intl.formatMessage({
            id: "jupyter.cell-buttonbar.format-button.tooltip",
            defaultMessage: "Format this code to look nice",
            description: "Code cell in a Jupyter Notebook",
          })}
          placement="top"
        >
          <Button
            disabled={formatting}
            type="text"
            size="small"
            style={CODE_BAR_BTN_STYLE}
            onClick={async () => {
              // kind of a hack: clicking on this button makes this cell
              // the selected one
              try {
                setFormatting(true);
                await delay(1);
                await frameActions.current?.format_selected_cells();
              } finally {
                setFormatting(false);
              }
              trackButton("format");
            }}
            aria-label="Format code"
            aria-busy={formatting}
          >
            <Icon name={formatting ? "spinner" : "sitemap"} spin={formatting} />{" "}
            <FormattedMessage
              id="jupyter.cell-buttonbar.format-button.label"
              defaultMessage={"Format"}
              description={"Code cell in a Jupyter Notebook"}
            />
          </Button>
        </Tooltip>
      );
    }

    function renderDropdownMenu() {
      if (is_readonly || input_is_readonly) return;

      return (
        <CodeBarDropdownMenu
          actions={actions}
          frameActions={frameActions}
          id={id}
          cell={cell}
        />
      );
    }

    function renderMarkdownEditButton() {
      if (
        !isMarkdownCell ||
        is_readonly ||
        actions == null ||
        input_is_readonly
      ) {
        return;
      }

      const editing = frameActions.current?.cell_md_is_editing(id);

      return (
        <Button
          style={CODE_BAR_BTN_STYLE}
          size="small"
          type="text"
          onClick={() => {
            frameActions.current?.toggle_md_cell_edit(id);
          }}
          aria-label={editing ? "Save markdown" : "Edit markdown"}
        >
          <Icon name={editing ? "save" : "edit"} />{" "}
          {editing
            ? intl.formatMessage(labels.save)
            : intl.formatMessage(labels.edit)}
        </Button>
      );
    }

    return (
      <div
        className="hidden-xs"
        style={MINI_BUTTONS_STYLE_INNER}
        role="region"
        aria-label={`Cell ${index + 1} controls`}
      >
        {renderCodeBarCellTiming()}
        {renderCodeBarRunStop()}
        {renderCodeBarComputeServer()}
        {renderCodeBarLLMButtons()}
        {renderMarkdownEditButton()}
        {renderCodeBarFormatButton()}
        {renderDropdownMenu()}
        <CellIndexNumber index={index} />
      </div>
    );
  },
  areEqual,
);

function ComputeServerPrompt({ id }) {
  return (
    <Tooltip
      title={
        <>
          This cell will run on <ComputeServer id={id} />.
        </>
      }
    >
      <div
        style={{
          fontSize: CODE_BAR_BTN_STYLE.fontSize,
          margin: "2px 5px 0 0",
        }}
      >
        <ComputeServer
          id={id}
          titleOnly
          style={{
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            display: "inline-block",
            maxWidth: "125px",
          }}
        />
      </div>
    </Tooltip>
  );
}
