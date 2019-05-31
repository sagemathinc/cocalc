/*
Viewer for public ipynb files.
*/

import { List, Map } from "immutable";
import { React, Component, rclass, rtypes } from "../app-framework";

const { ErrorDisplay, Loading } = require("../r_misc"); // TODO: import
const { CellList } = require("./cell-list"); // TODO: import
const { path_split } = require("smc-util/misc"); // TODO: import
import { JupyterActions } from "./browser-actions";

interface NBViewerProps {
  actions: JupyterActions;
  project_id?: string;
  path: string;
  loading?: object;
  error?: string;
  cell_list?: List<string>;
  cells?: Map<string, any>;
  font_size: number;
  cm_options?: Map<string, any>;
}

export class NBViewer0 extends Component<NBViewerProps> {
  static reduxProps({ name }) {
    return {
      [name]: {
        project_id: rtypes.string,
        path: rtypes.string.isRequired,
        loading: rtypes.object,
        error: rtypes.string,
        cell_list: rtypes.immutable,
        cells: rtypes.immutable,
        font_size: rtypes.number.isRequired,
        cm_options: rtypes.immutable
      }
    };
  }
  render_loading() {
    return (
      <Loading
        style={{
          fontSize: "24pt",
          textAlign: "center",
          marginTop: "15px",
          color: "#888"
        }}
      />
    );
  }
  render_error() {
    return (
      <ErrorDisplay
        error={this.props.error}
        onClose={() => this.props.actions.setState({ error: undefined })}
      />
    );
  }
  render_cells() {
    const directory = path_split(this.props.path).head;
    return (
      <CellList
        cell_list={this.props.cell_list}
        cells={this.props.cells}
        font_size={this.props.font_size}
        mode="escape"
        cm_options={this.props.cm_options}
        project_id={this.props.project_id}
        directory={directory}
        trust={false}
      />
    );
  }
  render_body() {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflowY: "hidden"
        }}
      >
        {this.render_cells()}
      </div>
    );
  }
  render() {
    if (this.props.error != null) {
      return this.render_error();
    } else if (
      this.props.cell_list != null &&
      this.props.cells != null &&
      this.props.cm_options != null
    ) {
      return this.render_body();
    }
    return this.render_loading();
  }
}

export const NBViewer = rclass(NBViewer0);
