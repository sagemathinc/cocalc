/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
React component that describes the output of a cell
*/

import { Alert } from "antd";
import type { Map as ImmutableMap } from "immutable";
import React from "react";
import { LLMTools } from "@cocalc/jupyter/types";
import type { JupyterActions } from "./browser-actions";
import { CellHiddenPart } from "./cell-hidden-part";
import { CollapsedOutput, OutputToggle } from "./cell-output-toggle";
import { CellOutputMessages } from "./output-messages/message";
import { OutputPrompt } from "./prompt/output";

interface CellOutputProps {
  actions?: JupyterActions;
  name?: string;
  id: string;
  cell: ImmutableMap<string, any>;
  project_id?: string;
  path?: string;
  directory?: string;
  more_output?: ImmutableMap<string, any>;
  trust?: boolean;
  complete?: boolean;
  hidePrompt?: boolean;
  style?: React.CSSProperties;
  divRef?;
  llmTools?: LLMTools;
  isDragging?: boolean;
}

export function CellOutput({
  actions,
  name,
  id,
  cell,
  project_id,
  path,
  directory,
  more_output,
  trust,
  complete,
  hidePrompt,
  divRef,
  style,
  llmTools,
  isDragging,
}: CellOutputProps) {
  const minHeight = complete ? "60vh" : undefined;

  if (cell.getIn(["metadata", "jupyter", "outputs_hidden"])) {
    return (
      <div key="out" style={{ minHeight }}>
        <CellHiddenPart
          title={
            "Output is hidden; show via Edit --> Toggle hide output in the menu."
          }
        />
      </div>
    );
  }

  if (cell.get("output") == null) {
    return <div key="out" style={{ minHeight }} />;
  }

  return (
    <div
      ref={divRef}
      key="out"
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        minHeight,
        ...style,
      }}
      cocalc-test="cell-output"
      className={
        "cocalc-output-div" /* used by stable unsafe html for clipping */
      }
    >
      {!hidePrompt && <ControlColumn cell={cell} actions={actions} id={id} />}
      <OutputColumn
        cell={cell}
        actions={actions}
        id={id}
        more_output={more_output}
        project_id={project_id}
        path={path}
        directory={directory}
        name={name}
        trust={trust}
        llmTools={llmTools}
        isDragging={isDragging}
      />
    </div>
  );
}

interface OutputColumnProps {
  cell: ImmutableMap<string, any>;
  id: string;
  actions?: JupyterActions;
  more_output?: ImmutableMap<string, any>;
  project_id?: string;
  path?: string;
  directory?: string;
  name?: string;
  trust?: boolean;
  llmTools?;
  isDragging?: boolean;
}

function OutputColumn({
  cell,
  id,
  actions,
  more_output,
  project_id,
  path,
  directory,
  name,
  trust,
  llmTools,
  isDragging,
}: OutputColumnProps) {
  if (isDragging) {
    // stable html + dragging breaks badly since you end up with two copies
    // of the same thing, etc.  Also, not carrying the output makes seeing
    // what is going on more manageable.
    return null;
  }
  if (cell.get("collapsed")) {
    return <CollapsedOutput actions={actions} id={id} />;
  }
  let output = cell.get("output");
  if (output == null) {
    return null;
  }
  if (more_output != null) {
    // There's more output; remove the button to get more output, and
    // include all the new more output messages.
    let n = output.size - 1;
    const more = output.get(`${n}`);
    more_output.get("mesg_list").forEach((mesg) => {
      output = output.set(`${n}`, mesg);
      n += 1;
    });
    if (cell.get("end") == null || more_output.get("time") < cell.get("end")) {
      // There may be more output since either the end time isn't set
      // or the time when we got the output is before the calculation ended.
      // We thus put the "more output" button back, so the user can click it again.
      output = output.set(`${n}`, more);
    }
  }
  return (
    <CellOutputMessages
      scrolled={cell.get("scrolled")}
      output={output}
      project_id={project_id}
      path={path}
      directory={directory}
      actions={actions}
      name={name}
      trust={trust}
      id={id}
      llmTools={llmTools}
    />
  );
}

function ControlColumn({ actions, cell, id }) {
  const collapsed = cell.get("collapsed");
  let exec_count = cell.get("exec_count");
  const output = cell.get("output");
  if (output != null) {
    for (const [, x] of output) {
      try {
        if (x.has("exec_count")) {
          exec_count = x.get("exec_count");
          break;
        }
      } catch (err) {
        return (
          <Alert
            style={{ margin: "5px" }}
            message="Malformed Output"
            description={`Notebook contains malformed output, i.e., the ipynb file is corrupt -- ${err}`}
            type="error"
            showIcon
          />
        );
      }
    }
  }
  const prompt = (
    <OutputPrompt
      state={cell.get("state")}
      exec_count={exec_count}
      collapsed={collapsed}
    />
  );
  if (actions == null || collapsed || output == null || output.size === 0) {
    return prompt;
  }
  if (actions != null) {
    return (
      <OutputToggle actions={actions} id={id} scrolled={cell.get("scrolled")}>
        {prompt}
      </OutputToggle>
    );
  }
  return null;
}
