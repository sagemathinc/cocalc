/*
The metadata editing toolbar.
*/

import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move

import { Button } from "react-bootstrap";
import { Map as ImmutableMap } from "immutable";

interface MetadataProps {
  actions: any; // TODO: types
  cell: ImmutableMap<any, any>; // TODO: types
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
