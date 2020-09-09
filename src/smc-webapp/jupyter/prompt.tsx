/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Components for rendering input and output prompts.
*/

import { React } from "../app-framework";
import { Icon, TimeAgo, Tip } from "../r_misc";
import { Button } from "antd";
import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

const misc = require("smc-util/misc");

export const PROMPT_MIN_WIDTH = "7em";

export const INPUT_PROMPT_COLOR: string = "#303F9F";

const INPUT_STYLE: React.CSSProperties = {
  color: INPUT_PROMPT_COLOR,
  minWidth: PROMPT_MIN_WIDTH,
  fontFamily: "monospace",
  textAlign: "right",
  paddingRight: "5px",
  cursor: "pointer",
};

interface InputPromptProps {
  type?: string;
  state?: string;
  exec_count?: number;
  kernel?: string;
  start?: number;
  end?: number;
  actions?: JupyterActions;
  frame_actions?: NotebookFrameActions;
  id: string;
}

export const InputPrompt: React.FC<InputPromptProps> = (props) => {
  let n;
  if (props.type !== "code") {
    return <div style={INPUT_STYLE} />;
  }
  const kernel = misc.capitalize(props.kernel != null ? props.kernel : "");
  let tip: string | JSX.Element = "Enter code to be evaluated.";
  switch (props.state) {
    case "start":
      n = <Icon name="arrow-circle-o-left" style={{ fontSize: "80%" }} />;
      tip = `Sending to be evaluated using ${kernel}.`;
      break;
    case "run":
      n = <Icon name="circle-o" style={{ fontSize: "80%" }} />;
      tip = `Waiting for another computation to finish first. Will evaluate using ${kernel}.`;
      break;
    case "busy":
      n = <Icon name="circle" style={{ fontSize: "80%", color: "#5cb85c" }} />;
      if (props.start != null) {
        tip = (
          <span>
            Running since <TimeAgo date={new Date(props.start)} /> using{" "}
            {kernel}.
          </span>
        );
      } else {
        tip = `Running using ${kernel}.`;
      }
      break;
    default:
      // done (or never run)
      if (props.exec_count) {
        n = props.exec_count;
        if (props.end != null) {
          tip = (
            <span>
              Evaluated <TimeAgo date={new Date(props.end)} /> using {kernel}.
            </span>
          );
        } else if (kernel) {
          tip = `Last evaluated using ${kernel}.`;
        }
      } else {
        n = " ";
      }
  }

  function move_cell(delta): void {
    props.frame_actions?.unselect_all_cells();
    props.frame_actions?.select_cell(props.id);
    props.frame_actions?.move_selected_cells(delta);
  }

  function cut_cell(): void {
    props.frame_actions?.unselect_all_cells();
    props.frame_actions?.select_cell(props.id);
    props.frame_actions?.cut_selected_cells();
  }

  const title = (
    <div>
      {props.actions != null && props.frame_actions != null ? (
        <div style={{ float: "right", color: "#666" }}>
          <Button size="small" onClick={() => move_cell(-1)}>
            <Icon name="arrow-up" />
          </Button>
          <Button size="small" onClick={() => move_cell(1)}>
            <Icon name="arrow-down" />
          </Button>{" "}
          <Button
            size="small"
            onClick={() => props.actions?.run_cell(props.id)}
          >
            <Icon name="step-forward" />
          </Button>
          <Button size="small" onClick={() => props.actions?.signal("SIGINT")}>
            <Icon name="stop" />
          </Button>
          <Button size="small" onClick={cut_cell}>
            <Icon name="cut" />
          </Button>{" "}
        </div>
      ) : (
        "Code Cell"
      )}
    </div>
  );

  return (
    <div style={INPUT_STYLE}>
      <Tip title={title} tip={tip} placement="top">
        In [{n}]:
      </Tip>
    </div>
  );
};

const OUTPUT_STYLE: React.CSSProperties = {
  color: "#D84315",
  minWidth: PROMPT_MIN_WIDTH,
  fontFamily: "monospace",
  textAlign: "right",
  paddingRight: "5px",
  paddingBottom: "2px",
};

interface OutputPromptProps {
  state?: string;
  exec_count?: number;
  collapsed?: boolean;
}

export const OutputPrompt: React.FC<OutputPromptProps> = (props) => {
  let n;
  if (props.collapsed || !props.exec_count) {
    n = undefined;
  } else {
    n = props.exec_count != null ? props.exec_count : " ";
  }
  if (n == null) {
    return <div style={OUTPUT_STYLE} />;
  }
  return <div style={OUTPUT_STYLE}>Out[{n}]:</div>;
};
