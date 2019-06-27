/*
Viewer for public ipynb files, e.g., on the share server.
*/

import { List, Map } from "immutable";
import {
  React,
  Component,
  rclass,
  rtypes,
  Rendered
} from "../../app-framework";

import { ErrorDisplay } from "../../r_misc/error-display";
import { Loading } from "../../r_misc/loading";
import { CellList } from "../cell-list";
import { path_split } from "smc-util/misc";
import { JupyterActions } from "../browser-actions";

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
  public static reduxProps({ name }) {
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

  private render_loading(): Rendered {
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

  private render_error(): Rendered {
    return (
      <ErrorDisplay
        error={this.props.error}
        onClose={() => this.props.actions.setState({ error: undefined })}
      />
    );
  }

  private render_cells(): Rendered {
    if (this.props.cell_list == null || this.props.cells == null)
      return <Loading />;
    const directory = path_split(this.props.path).head;
    return (
      <CellList
        cell_list={this.props.cell_list}
        cells={this.props.cells}
        font_size={this.props.font_size}
        mode="escape"
        cm_options={
          this.props.cm_options
            ? this.props.cm_options
            : Map() }
        project_id={this.props.project_id}
        directory={directory}
        trust={false}
      />
    );
  }

  private render_body(): Rendered {
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
  public render(): Rendered {
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
