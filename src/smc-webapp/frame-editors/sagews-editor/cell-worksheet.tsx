import { Map, Set } from "immutable";
import { React, Component, Rendered, rtypes, rclass } from "../../app-framework";

import { Cell } from "./cell";

interface Props {
  actions: any;

  path: string;
  project_id: string;
  font_size: number;
  cursors: Map<string, any>;
  editor_state: Map<string, any>;
  read_only: boolean;
  is_current: boolean;
  is_public: boolean;
  misspelled_words: Set<string>;
  resize: number;
  gutters: string[];
  gutter_markers: Map<string, any>;
  editor_settings: Map<string, any>;

  // reduxProps:
  cells: Map<string, Map<string, any>>;
}

class CellWorksheet extends Component<Props, {}> {
  static reduxProps({ name }) {
    return {
      [name]: {
        cells: rtypes.immutable.Map
      }
    };
  }

  render_cell(id: string, cell: Map<string, any>): Rendered {
    return (
      <Cell
        key={id}
        id={id}
        cell={cell}
        actions={this.props.actions}
        path={this.props.path}
        project_id={this.props.project_id}
        font_size={this.props.font_size}
        cursors={this.props.cursors}
        editor_state={this.props.editor_state}
        read_only={this.props.read_only}
        is_current={false}
        is_public={this.props.is_public}
        misspelled_words={this.props.misspelled_words}
        resize={this.props.resize}
        gutters={this.props.gutters}
        gutter_markers={this.props.gutter_markers}
        editor_settings={this.props.editor_settings}
      />
    );
  }

  render_cells(): Rendered[] {
    const v: Rendered[] = [];
    // TODO: sort by position.
    this.props.cells.forEach((cell, id) => {
      v.push(this.render_cell(id, cell));
    });
    return v;
  }

  render(): Rendered {
    return <div>{this.render_cells()}</div>;
  }
}

const tmp0 = rclass(CellWorksheet);
export { tmp0 as CellWorksheet };
