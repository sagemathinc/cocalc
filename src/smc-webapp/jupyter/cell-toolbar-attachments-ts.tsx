/*
The attachment editing toolbar functionality for cells.
*/

import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move

import { Button } from "react-bootstrap";
import { Map as ImmutableMap } from "immutable";

interface AttachmentsProps {
  actions: any; // TODO types
  cell: ImmutableMap<string, any>; // TODO types
}

export class Attachments extends Component<AttachmentsProps> {
  edit = () => this.props.actions.edit_attachments(this.props.cell.get("id"));
  render() {
    return (
      <Button bsSize="small" onClick={this.edit}>
        Delete Attachments...
      </Button>
    );
  }
}
