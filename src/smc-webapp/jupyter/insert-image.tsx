/*
Modal for inserting an image
*/

import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move

const { Icon } = require("../r_misc"); // TODO: import types
const { Button, Modal } = require("react-bootstrap"); // TODO: import types
const { SMC_Dropzone } = require("../smc-dropzone"); // TODO: import types

const TMP = ".smc/tmp"; // TODO: maybe .smc will change...

interface InsertImageProps {
  actions: any; // TODO: type
  project_id: string;
  cur_id: string;
  insert_image?: boolean;
}

export class InsertImage extends Component<InsertImageProps> {
  shouldComponentUpdate(nextProps) {
    return nextProps.insert_image !== this.props.insert_image;
  }
  close = () => {
    this.props.actions.setState({ insert_image: false });
  };
  add_file = (file: any) => {
    // TODO: types
    this.props.actions.add_attachment_to_cell(
      this.props.cur_id,
      TMP + "/" + file.name
    );
  };
  render() {
    return (
      <Modal show={this.props.insert_image} bsSize="large" onHide={this.close}>
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="file-image-o" /> Pick image files to attach to this
            markdown cell
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <SMC_Dropzone
            project_id={this.props.project_id}
            current_path={TMP}
            dropzone_handler={{ addedfile: this.add_file }}
          />
        </Modal.Body>

        <Modal.Footer>
          <Button onClick={this.close}>Done</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}
