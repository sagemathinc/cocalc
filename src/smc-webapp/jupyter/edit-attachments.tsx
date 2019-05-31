/*
Modal for editing attachments that are attached to a markdown cell
*/

import { React, Component } from "../app-framework";
const { Icon } = require("../r_misc");
import { Button, Modal } from "react-bootstrap";
import { Map as ImmutableMap } from "immutable";
import { JupyterActions } from "./browser-actions";

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  border: "1px solid #ddd",
  padding: "7px",
  borderRadius: "3px"
};

interface EditAttachmentsProps {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>;
}

export class EditAttachments extends Component<EditAttachmentsProps> {
  shouldComponentUpdate(nextProps) {
    return nextProps.cell !== this.props.cell;
  }

  close = () => {
    this.props.actions.setState({ edit_attachments: undefined });
    this.props.actions.focus(true);
  };

  delete_attachment = (name: string) => {
    this.props.actions.delete_attachment_from_cell(this.props.cell.get("id"), name);
  };

  render_attachment = (name: string) => {
    return (
      <div key={name} style={{ ...ROW_STYLE, width: "100%" }}>
        <div style={{ flex: 1 }}>{name}</div>
        <div>
          <Button onClick={() => this.delete_attachment(name)} bsStyle="danger">
            <Icon name="trash" /> Delete
          </Button>
        </div>
      </div>
    );
  };

  render_attachments = () => {
    const v: any[] = [];
    if (this.props.cell) {
      const attachments = this.props.cell.get("attachments");
      if (attachments) {
        attachments.forEach((_, name) => {
          if (v.length > 0) {
            v.push(<div style={{ marginTop: "7px" }} key={name + "space"} />);
          }
          return v.push(this.render_attachment(name));
        });
      }
    }
    if (v.length === 0) {
      return <span>There are no attachments. To attach images, use Edit -> Insert Image.</span>;
    }
    return v;
  };

  render() {
    return (
      <Modal show={this.props.cell != null} onHide={this.close}>
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="trash" /> Delete Cell Attachments
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>{this.render_attachments()}</Modal.Body>

        <Modal.Footer>
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}
