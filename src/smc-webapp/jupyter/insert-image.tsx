/*
Modal for inserting an image
*/

import { React, Component, Rendered } from "../app-framework";

const { Icon } = require("../r_misc"); // TODO: import types
const { Button, Modal } = require("react-bootstrap"); // TODO: import types
const { SMC_Dropzone } = require("../smc-dropzone"); // TODO: import types
import { JupyterActions } from "./browser-actions";

const TMP = ".smc/tmp"; // TODO: maybe .smc will change...

interface InsertImageProps {
  actions: JupyterActions;
  project_id: string;
  insert_image: string;
}

export class InsertImage extends Component<InsertImageProps> {
  public shouldComponentUpdate(nextProps): boolean {
    return nextProps.insert_image !== this.props.insert_image;
  }

  private close(): void {
    this.props.actions.setState({ insert_image: undefined });
  }

  private add_file(file: { name: string }): void {
    this.props.actions.add_attachment_to_cell(
      this.props.insert_image,
      TMP + "/" + file.name
    );
  }

  render(): Rendered {
    return (
      <Modal
        show={this.props.insert_image != null}
        bsSize="large"
        onHide={this.close.bind(this)}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="image" /> Pick image files to attach to this markdown
            cell
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <SMC_Dropzone
            project_id={this.props.project_id}
            current_path={TMP}
            dropzone_handler={{ addedfile: this.add_file.bind(this) }}
          />
        </Modal.Body>

        <Modal.Footer>
          <Button onClick={this.close.bind(this)}>Done</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}
