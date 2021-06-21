/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Modal for inserting an image
*/

import { React } from "../app-framework";
import { Icon } from "../r_misc";
const { Button, Modal } = require("react-bootstrap"); // TODO: import types
import { FileUpload } from "../file-upload";
import { JupyterActions } from "./browser-actions";

const TMP = ".smc/tmp"; // TODO: maybe .smc will change...

interface InsertImageProps {
  actions: JupyterActions;
  project_id: string;
  insert_image: string;
}

function should_memoize(prev, next) {
  return next.insert_image === prev.insert_image;
}

export const InsertImage: React.FC<InsertImageProps> = React.memo(
  (props: InsertImageProps) => {
    const { actions, project_id, insert_image } = props;

    function close(): void {
      actions.setState({ insert_image: undefined });
    }

    function add_file(file: { name: string }): void {
      actions.add_attachment_to_cell(insert_image, TMP + "/" + file.name);
    }

    return (
      <Modal show={insert_image != null} bsSize="large" onHide={close}>
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="image" /> Pick image files to attach to this markdown
            cell
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <FileUpload
            project_id={project_id}
            current_path={TMP}
            dropzone_handler={{ addedfile: add_file }}
            show_header={true}
          />
        </Modal.Body>

        <Modal.Footer>
          <Button onClick={close}>Done</Button>
        </Modal.Footer>
      </Modal>
    );
  },
  should_memoize
);
