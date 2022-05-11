/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
React component that describes the output of a cell
*/

import React from "react";
import type { Map as ImmutableMap } from "immutable";
import { CellOutputMessages } from "./output-messages/message";
import { OutputPrompt } from "./prompt/output";
import { OutputToggle, CollapsedOutput } from "./cell-output-toggle";
import { CellHiddenPart } from "./cell-hidden-part";
import type { JupyterActions } from "./browser-actions";

interface CellOutputProps {
  actions?: JupyterActions;
  name?: string;
  id: string;
  cell: ImmutableMap<string, any>;
  project_id?: string;
  directory?: string;
  more_output?: ImmutableMap<string, any>;
  trust?: boolean;
  complete?: boolean;
  hidePrompt?: boolean;
  style?: React.CSSProperties;
  divRef?;
}

function should_memoize(prev, next) {
  for (const field of [
    "collapsed",
    "scrolled",
    "exec_count",
    "state",
    "metadata",
  ]) {
    if (next.cell.get(field) !== prev.cell.get(field)) {
      return false;
    }
  }
  if (
    prev.more_output !== next.more_output ||
    prev.trust !== next.trust ||
    prev.complete !== next.complete
  ) {
    return false;
  }
  const new_output = next.cell.get("output");
  const cur_output = prev.cell.get("output");
  if (new_output == null) {
    return cur_output == null;
  }
  if (cur_output == null) {
    return new_output == null;
  }
  return new_output.equals(cur_output);
}

export const CellOutput: React.FC<CellOutputProps> = React.memo(
  (props: CellOutputProps) => {
    const {
      actions,
      name,
      id,
      cell,
      project_id,
      directory,
      more_output,
      trust,
      complete,
      hidePrompt,
      divRef,
      style,
    } = props;

    function render_output_prompt() {
      const collapsed = cell.get("collapsed");
      let exec_count = cell.get("exec_count");
      const output = cell.get("output");
      if (output != null) {
        output.forEach((x) => {
          if (x?.has("exec_count")) {
            // NOTE: The ? -- I hit a case where x was undefined **in production**, so it can happen.
            exec_count = x.get("exec_count");
            return false;
          }
        });
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
          <OutputToggle
            actions={actions}
            id={id}
            scrolled={cell.get("scrolled")}
          >
            {prompt}
          </OutputToggle>
        );
      }
    }

    function render_collapsed(): JSX.Element {
      return <CollapsedOutput actions={actions} id={id} />;
    }

    function render_output_value(): JSX.Element | undefined {
      if (cell.get("collapsed")) {
        return render_collapsed();
      }
      let output = cell.get("output");
      if (output == null) {
        return;
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
        if (
          cell.get("end") == null ||
          more_output.get("time") < cell.get("end")
        ) {
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
          directory={directory}
          actions={actions}
          name={name}
          trust={trust}
          id={id}
        />
      );
    }

    function render_hidden(): JSX.Element {
      return (
        <CellHiddenPart
          title={
            "Output is hidden; show via Edit --> Toggle hide output in the menu."
          }
        />
      );
    }

    const minHeight = complete ? "60vh" : undefined;

    if (cell.getIn(["metadata", "jupyter", "outputs_hidden"])) {
      return (
        <div key="out" style={{ minHeight }}>
          {render_hidden()}
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
      >
        {!hidePrompt && render_output_prompt()}
        {render_output_value()}
      </div>
    );
  },
  should_memoize
);

