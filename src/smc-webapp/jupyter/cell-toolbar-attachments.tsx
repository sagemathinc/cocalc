/*
The attachment editing toolbar functionality for cells.
*/

import { React, Component } from "../app-framework";

import { Button } from "react-bootstrap";
import { Map as ImmutableMap } from "immutable";

import { JupyterActions } from "./browser-actions";

interface AttachmentsProps {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>; // TODO types
}

export class Attachments extends Component<AttachmentsProps> {
  edit(): void {
    this.props.actions.edit_attachments(this.props.cell.get("id"));
  }

  render() {
    return (
      <div style={{ width: "100%" }}>
        <Button
          bsSize="small"
          onClick={() => this.edit()}
          style={{ float: "right" }}
        >
          Delete Attachments...
        </Button>
      </div>
    );
  }
}
