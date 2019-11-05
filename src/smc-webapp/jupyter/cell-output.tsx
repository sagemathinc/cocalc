/*
React component that describes the output of a cell
*/

import { React, Component, Rendered } from "../app-framework";
import { Map as ImmutableMap } from "immutable";
import { CellOutputMessages } from "./output-messages/message";

import { OutputPrompt } from "./prompt";
import { OutputToggle, CollapsedOutput } from "./cell-output-toggle";
import { CellHiddenPart } from "./cell-hidden-part";

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

interface CellOutputProps {
  actions?: JupyterActions;
  frame_actions?: NotebookFrameActions;
  name?: string;
  id: string;
  cell: ImmutableMap<string, any>;
  project_id?: string;
  directory?: string;
  more_output?: ImmutableMap<string, any>;
  trust?: boolean;
  complete?: boolean;
}

export class CellOutput extends Component<CellOutputProps> {
  public shouldComponentUpdate(nextProps: CellOutputProps): boolean {
    for (const field of [
      "collapsed",
      "scrolled",
      "exec_count",
      "state",
      "metadata"
    ]) {
      if (nextProps.cell.get(field) !== this.props.cell.get(field)) {
        return true;
      }
    }
    if (
      this.props.more_output !== nextProps.more_output ||
      this.props.trust !== nextProps.trust ||
      this.props.complete !== nextProps.complete
    ) {
      return true;
    }
    const new_output = nextProps.cell.get("output");
    const cur_output = this.props.cell.get("output");
    if (new_output == null) {
      return cur_output != null;
    }
    if (cur_output == null) {
      return new_output != null;
    }
    return !new_output.equals(cur_output);
  }

  private render_output_prompt(): Rendered {
    const collapsed = this.props.cell.get("collapsed");
    let exec_count = undefined;
    const output = this.props.cell.get("output");
    if (output != null) {
      output.forEach(x => {
        if (x.has("exec_count")) {
          exec_count = x.get("exec_count");
          return false;
        }
      });
    }
    const prompt = (
      <OutputPrompt
        state={this.props.cell.get("state")}
        exec_count={exec_count}
        collapsed={collapsed}
      />
    );
    if (
      this.props.actions == null ||
      collapsed ||
      output == null ||
      output.size === 0
    ) {
      return prompt;
    }
    if (this.props.actions != null) {
      return (
        <OutputToggle
          actions={this.props.actions}
          id={this.props.id}
          scrolled={this.props.cell.get("scrolled")}
        >
          {prompt}
        </OutputToggle>
      );
    }
  }

  private render_collapsed(): Rendered {
    return <CollapsedOutput actions={this.props.actions} id={this.props.id} />;
  }

  private render_output_value(): Rendered {
    if (this.props.cell.get("collapsed")) {
      return this.render_collapsed();
    } else {
      let output = this.props.cell.get("output");
      if (output == null) {
        return;
      }
      if (this.props.more_output != null) {
        // There's more output; remove the button to get more output, and
        // include all the new more output messages.
        let n = output.size - 1;
        const more = output.get(`${n}`);
        this.props.more_output.get("mesg_list").forEach(mesg => {
          output = output.set(`${n}`, mesg);
          n += 1;
        });
        if (
          this.props.cell.get("end") == null ||
          this.props.more_output.get("time") < this.props.cell.get("end")
        ) {
          // There may be more output since either the end time isn't set
          // or the time when we got the output is before the calculation ended.
          // We thus put the "more output" button back, so the user can click it again.
          output = output.set(`${n}`, more);
        }
      }
      return (
        <CellOutputMessages
          scrolled={this.props.cell.get("scrolled")}
          output={output}
          project_id={this.props.project_id}
          directory={this.props.directory}
          actions={this.props.actions}
          frame_actions={this.props.frame_actions}
          name={this.props.name}
          trust={this.props.trust}
          id={this.props.id}
        />
      );
    }
  }

  private render_hidden(): Rendered {
    return (
      <CellHiddenPart
        title={
          "Output is hidden; show via Edit --> Toggle hide output in the menu."
        }
      />
    );
  }

  public render(): Rendered {
    const minHeight = this.props.complete ? "60vh" : undefined;
    if (this.props.cell.getIn(["metadata", "jupyter", "outputs_hidden"])) {
      return (
        <div key="out" style={{ minHeight }}>
          {this.render_hidden()}
        </div>
      );
    }
    if (this.props.cell.get("output") == null) {
      return <div key="out" style={{ minHeight }} />;
    }
    return (
      <div
        key="out"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          minHeight
        }}
      >
        {this.render_output_prompt()}
        {this.render_output_value()}
      </div>
    );
  }
}
