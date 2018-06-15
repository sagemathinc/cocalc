/*
React component that describes the output of a cell
*/

import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move
import { Map as ImmutableMap } from "immutable";
const { CellOutputMessages } = require("./cell-output-message");
const { OutputPrompt } = require("./prompt");
const { OutputToggle, CollapsedOutput } = require("./cell-output-toggle");

interface CellOutputProps {
  actions?: any;
  id: string;
  cell: ImmutableMap<any, any>;
  project_id?: string;
  directory?: string;
  more_output?: ImmutableMap<any, any>;
  trust?: boolean;
}

export class CellOutput extends Component<CellOutputProps> {
  shouldComponentUpdate(nextProps) {
    for (let field of ["collapsed", "scrolled", "exec_count", "state"]) {
      if (nextProps.cell.get(field) !== this.props.cell.get(field)) {
        return true;
      }
    }
    if (this.props.more_output !== nextProps.more_output || this.props.trust !== nextProps.trust) {
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

  render_output_prompt() {
    const collapsed = this.props.cell.get("collapsed");
    let exec_count = undefined;
    const output = this.props.cell.get("output");
    if (output != null) {
      output.forEach((x) => {
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
    if (this.props.actions == null || collapsed || output == null || output.size === 0) {
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

  render_collapsed() {
    return <CollapsedOutput actions={this.props.actions} id={this.props.id} />;
  }

  render_output_value() {
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
          trust={this.props.trust}
          id={this.props.id}
        />
      );
    }
  }

  render() {
    if (this.props.cell.get("output") == null) {
      return <div />;
    }
    return (
      <div key="out" style={{ display: "flex", flexDirection: "row", alignItems: "stretch" }}>
        {this.render_output_prompt()}
        {this.render_output_value()}
      </div>
    );
  }
}
