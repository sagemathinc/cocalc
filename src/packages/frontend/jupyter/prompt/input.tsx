/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Components for rendering input and output prompts.
*/

import React from "react";
import { Icon } from "@cocalc/frontend/r_misc/icon";
import { TimeAgo } from "@cocalc/frontend/r_misc/time-ago";
import { Tip } from "@cocalc/frontend/r_misc/tip";
import { Button } from "antd";
import { capitalize } from "@cocalc/util/misc";
import { INPUT_STYLE, InputPromptProps } from "./base";

export const InputPrompt: React.FC<InputPromptProps> = (props) => {
  let n;
  if (props.type !== "code") {
    return <div style={INPUT_STYLE} />;
  }
  const kernel = capitalize(props.kernel != null ? props.kernel : "");
  let tip: string | JSX.Element = "Enter code to be evaluated.";
  switch (props.state) {
    case "start":
      n = <Icon name="arrow-circle-o-left" style={{ fontSize: "80%" }} />;
      tip = `Sending to be evaluated using ${kernel}.`;
      break;
    case "run":
      n = <Icon name="cocalc-ring" style={{ fontSize: "80%" }} />;
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
    if (
      props.id == null ||
      props.frame_actions == null ||
      props.frame_actions.is_closed()
    )
      return;
    props.frame_actions.unselect_all_cells();
    props.frame_actions.select_cell(props.id);
    props.frame_actions.move_selected_cells(delta);
  }

  function cut_cell(): void {
    if (
      props.id == null ||
      props.frame_actions == null ||
      props.frame_actions.is_closed()
    )
      return;
    props.frame_actions.unselect_all_cells();
    props.frame_actions.select_cell(props.id);
    props.frame_actions.cut_selected_cells();
  }

  function run_cell(): void {
    if (props.id == null || props.actions == null || props.actions.is_closed())
      return;
    props.actions?.run_cell(props.id);
  }

  function stop_cell(): void {
    if (props.actions == null || props.actions.is_closed()) return;
    props.actions?.signal("SIGINT");
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
          <Button size="small" onClick={run_cell}>
            <Icon name="step-forward" />
          </Button>
          <Button size="small" onClick={stop_cell}>
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
    <div style={{ ...INPUT_STYLE, cursor: "pointer" }}>
      <Tip title={title} tip={tip} placement="top">
        In [{n}]:
      </Tip>
    </div>
  );
};
