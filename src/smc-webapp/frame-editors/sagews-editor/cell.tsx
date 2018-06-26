import { Map, Set } from "immutable";

import { React, Component, Rendered } from "../generic/react";

import { input_is_hidden, output_is_hidden } from "./flags";

import { InputCell } from "./input-cell";
import { OutputCell } from "./output-cell";
import { HiddenInputCell } from "./hidden-input-cell";
import { HiddenOutputCell } from "./hidden-output-cell";

interface Props {
  actions: any;
  id: string;
  cell: Map<string, any>;

  path: string;
  project_id: string;
  font_size : number;
  cursors : Map<string,any>;
  editor_state : Map<string,any>;
  read_only : boolean;
  is_current: boolean;
  is_public: boolean;
  misspelled_words : Set<string>;
  resize : number;
  gutters: string[];
  gutter_markers: Map<string, any>;
  editor_settings: Map<string, any>;

  value? : string;
}

export class Cell extends Component<Props, {}> {
  render_input_cell(): Rendered {
    if (input_is_hidden(this.props.cell.get("flags"))) {
      return (
        <HiddenInputCell id={this.props.cell.get("id")} actions={this.props.actions} />
      );
    } else {
      return (
        <InputCell
          input={this.props.cell.get("input")}
          id={this.props.cell.get("id")}
          actions={this.props.actions}

          path={this.props.path}
          project_id={this.props.project_id}
          font_size={this.props.font_size}
          cursors={this.props.cursors}
          editor_state={this.props.editor_state}
          read_only={this.props.read_only}
          is_current={this.props.is_current}
          is_public={this.props.is_public}
          value={this.props.value}
          misspelled_words={this.props.misspelled_words}
          resize={this.props.resize}
          gutters={this.props.gutters}
          gutter_markers={this.props.gutter_markers}
          editor_settings={this.props.editor_settings}
        />
      );
    }
  }

  render_output_cell(): Rendered {
    if (output_is_hidden(this.props.cell.get("flags"))) {
      return (
        <HiddenOutputCell id={this.props.cell.get("id")} actions={this.props.actions} />
      );
    } else {
      return (
        <OutputCell
          output={this.props.cell.get("output", Map())}
          id={this.props.cell.get("id")}
          actions={this.props.actions}
        />
      );
    }
  }

  render(): Rendered {
    return (
      <div>
        <div>{this.render_input_cell()}</div>
        <div>{this.render_output_cell()}</div>
      </div>
    );
  }
}
