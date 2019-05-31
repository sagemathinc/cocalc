/*
The metadata editing toolbar.
*/

import { React, Component } from "../app-framework";

import { Button } from "react-bootstrap";
import { Map as ImmutableMap } from "immutable";
import { JupyterActions } from "./browser-actions";

interface MetadataProps {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>;
}

export class Metadata extends Component<MetadataProps> {
  edit = () => this.props.actions.edit_cell_metadata(this.props.cell.get("id"));
  render() {
    return (
      <Button bsSize="small" onClick={this.edit}>
        Edit Custom Metadata...
      </Button>
    );
  }
}
