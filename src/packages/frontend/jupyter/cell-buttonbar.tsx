/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
React component that describes the input of a cell
*/

import { Button, Tooltip } from "antd";
import { delay } from "awaiting";
import { Map } from "immutable";
import React, { useState } from "react";

import { Icon } from "@cocalc/frontend/components";
import CopyButton from "@cocalc/frontend/components/copy-button";
import PasteButton from "@cocalc/frontend/components/paste-button";
import ComputeServer from "@cocalc/frontend/compute/inline";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import track from "@cocalc/frontend/user-tracking";
import { LLMTools } from "@cocalc/jupyter/types";
import { numToOrdinal } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { JupyterActions } from "./browser-actions";
import CellTiming from "./cell-output-time";
import {
  CODE_BAR_BTN_STYLE,
  MINI_BUTTONS_STYLE,
  MINI_BUTTONS_STYLE_INNER,
} from "./consts";
import { LLMCellTool } from "./llm";

interface Props {
  id: string;
  actions?: JupyterActions;
  cell: Map<string, any>;
  is_current: boolean;
  computeServerId?: number;
  llmTools?: LLMTools;
  index: number;
  is_readonly: boolean;
}

function areEqual(prev: Props, next: Props): boolean {
  return !(
    next.id !== prev.id ||
    next.index !== prev.index ||
    next.cell !== prev.cell ||
    next.is_current !== prev.is_current ||
    next.computeServerId !== prev.computeServerId ||
    (next.llmTools?.model ?? "") !== (prev.llmTools?.model ?? "") ||
    next.is_current !== prev.is_current ||
    next.is_readonly !== prev.is_readonly
  );
}

export const CellButtonBar: React.FC<Props> = React.memo(
  ({
    id,
    actions,
    cell,
    is_current,
    computeServerId,
    llmTools,
    index,
    is_readonly,
  }: Props) => {
    const frameActions = useNotebookFrameActions();
    const [formatting, setFormatting] = useState<boolean>(false);

    function renderCodeBarRunStop() {
      if (id == null || actions == null || actions.is_closed()) {
        return;
      }
      switch (cell.get("state")) {
        case "busy":
        case "run":
        case "start":
          return (
            <Tooltip placement="top" title="Stop this cell">
              <Button
                size="small"
                type="text"
                onClick={() => {
                  actions?.signal("SIGINT");
                  track("jupyter-cell-buttonbar", { button: "stop" });
                }}
                style={CODE_BAR_BTN_STYLE}
              >
                <Icon name="stop" /> Stop
              </Button>
            </Tooltip>
          );
        default:
          return (
            <Tooltip placement="top" title="Run this cell">
              <Button
                size="small"
                type="text"
                onClick={() => {
                  actions?.run_cell(id);
                  track("jupyter-cell-buttonbar", { button: "run" });
                }}
                style={CODE_BAR_BTN_STYLE}
              >
                <Icon name="step-forward" /> Run
              </Button>
            </Tooltip>
          );
      }
    }

    function renderCodeBarComputeServer() {
      if (!is_current || !computeServerId) return;
      return <ComputeServerPrompt id={computeServerId} />;
    }

    function renderCodeBarCellTiming() {
      if (cell.get("start") == null) return;
      return (
        <div style={{ margin: "4px 4px 4px 10px" }}>
          <CellTiming start={cell.get("start")} end={cell.get("end")} />
        </div>
      );
    }

    function renderCodeBarLLMButtons() {
      if (!llmTools) return;
      return (
        <LLMCellTool
          id={id}
          actions={actions}
          llmTools={llmTools}
          is_current={is_current}
        />
      );
    }

    function renderCodeBarFormatButton() {
      // Should only show formatter button if there is a way to format this code.
      if (is_readonly || actions == null) return;
      return (
        <Tooltip title="Format this code to look nice" placement="top">
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
              track("jupyter-cell-buttonbar", { button: "format" });
            }}
          >
            <Icon name={formatting ? "spinner" : "sitemap"} spin={formatting} />{" "}
            Format
          </Button>
        </Tooltip>
      );
    }

    function renderCodeBarCopyPasteButtons(input: string | undefined) {
      if (input) {
        return (
          <CopyButton
            size="small"
            value={cell.get("input") ?? ""}
            style={CODE_BAR_BTN_STYLE}
          />
        );
      } else {
        return (
          <PasteButton
            style={CODE_BAR_BTN_STYLE}
            paste={(text) => {
              frameActions.current?.set_cell_input(id, text);
              track("jupyter-cell-buttonbar", { button: "paste" });
            }}
          />
        );
      }
    }

    function renderCodeBarIndexNumber(input: string | undefined) {
      if (!input) return;
      return (
        <Tooltip
          placement="top"
          title={`This is the ${numToOrdinal(index + 1)} cell in the notebook.`}
        >
          <div
            style={{
              marginLeft: "1px",
              padding: "4px 5px 4px 6px",
              borderLeft: `1px solid ${COLORS.GRAY_LL}`,
            }}
          >
            {index + 1}
          </div>
        </Tooltip>
      );
    }

    const input: string | undefined = cell.get("input")?.trim();

    return (
      <div style={MINI_BUTTONS_STYLE} className="hidden-xs">
        <div style={MINI_BUTTONS_STYLE_INNER}>
          {renderCodeBarCellTiming()}
          {renderCodeBarRunStop()}
          {renderCodeBarComputeServer()}
          {renderCodeBarLLMButtons()}
          {renderCodeBarFormatButton()}
          {renderCodeBarCopyPasteButtons(input)}
          {renderCodeBarIndexNumber(input)}
        </div>
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
