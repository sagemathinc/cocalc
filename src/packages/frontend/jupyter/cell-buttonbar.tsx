/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
React component that describes the input of a cell
*/

import { Button, Tooltip } from "antd";
import { delay } from "awaiting";
import { useState } from "react";

import { Icon } from "@cocalc/frontend/components";
import CopyButton from "@cocalc/frontend/components/copy-button";
import PasteButton from "@cocalc/frontend/components/paste-button";
import ComputeServer from "@cocalc/frontend/compute/inline";
import { numToOrdinal } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import CellTiming from "./cell-output-time";
import {
  CODE_BAR_BTN_STYLE,
  MINI_BUTTONS_STYLE,
  MINI_BUTTONS_STYLE_INNER,
} from "./consts";
import { LLMCellTool } from "./llm";

export function CellButtonBar({ props, frameActions }) {
  const [formatting, setFormatting] = useState<boolean>(false);

  function renderCodeBarRunStop() {
    if (
      props.id == null ||
      props.actions == null ||
      props.actions.is_closed()
    ) {
      return;
    }
    switch (props.cell.get("state")) {
      case "busy":
      case "run":
      case "start":
        return (
          <Tooltip placement="top" title="Stop this cell">
            <Button
              size="small"
              type="text"
              onClick={() => props.actions?.signal("SIGINT")}
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
              onClick={() => props.actions?.run_cell(props.id)}
              style={CODE_BAR_BTN_STYLE}
            >
              <Icon name="step-forward" /> Run
            </Button>
          </Tooltip>
        );
    }
  }

  function renderCodeBarComputeServer() {
    if (!props.is_current || !props.computeServerId) return;
    return <ComputeServerPrompt id={props.computeServerId} />;
  }

  function renderCodeBarCellTiming() {
    if (props.cell.get("start") == null) return;
    return (
      <div style={{ margin: "4px 4px 4px 10px" }}>
        <CellTiming
          start={props.cell.get("start")}
          end={props.cell.get("end")}
        />
      </div>
    );
  }

  function renderCodeBarLLMButtons() {
    if (!props.llmTools) return;
    return (
      <LLMCellTool
        id={props.id}
        actions={props.actions}
        llmTools={props.llmTools}
        is_current={props.is_current}
      />
    );
  }

  function renderCodeBarFormatButton() {
    // Should only show formatter button if there is a way to format this code.
    if (props.is_readonly || props.actions == null) return;
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
          value={props.cell.get("input") ?? ""}
          style={CODE_BAR_BTN_STYLE}
        />
      );
    } else {
      return (
        <PasteButton
          style={CODE_BAR_BTN_STYLE}
          paste={(text) => frameActions.current?.set_cell_input(props.id, text)}
        />
      );
    }
  }

  function renderCodeBarIndexNumber(input: string | undefined) {
    if (!input) return;
    return (
      <Tooltip
        placement="top"
        title={`This is the ${numToOrdinal(
          props.index + 1,
        )} cell in the notebook.`}
      >
        <div
          style={{
            marginLeft: "1px",
            padding: "4px 5px 4px 6px",
            borderLeft: `1px solid ${COLORS.GRAY_LL}`,
          }}
        >
          {props.index + 1}
        </div>
      </Tooltip>
    );
  }

  const input: string | undefined = props.cell.get("input")?.trim();

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
}

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
          margin: "5px 15px 0 0",
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
