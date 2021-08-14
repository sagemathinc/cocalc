/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Modal for editing attachments that are attached to a markdown cell
*/

import { React } from "../app-framework";
import { Icon } from "../components";
import { Button, Modal } from "react-bootstrap";
import { Map as ImmutableMap } from "immutable";
import { JupyterActions } from "./browser-actions";

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  border: "1px solid #ddd",
  padding: "7px",
  borderRadius: "3px",
} as const;

interface EditAttachmentsProps {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>;
}

function should_memoize(prev, next) {
  return next.cell === prev.cell;
}

export const EditAttachments: React.FC<EditAttachmentsProps> = React.memo(
  (props: EditAttachmentsProps) => {
    const { actions, cell } = props;

    function close() {
      actions.setState({ edit_attachments: undefined });
      actions.focus(true);
    }

    function delete_attachment(name: string) {
      actions.delete_attachment_from_cell(cell.get("id"), name);
    }

    function render_attachment(name: string) {
      return (
        <div key={name} style={{ ...ROW_STYLE, width: "100%" }}>
          <div style={{ flex: 1 }}>{name}</div>
          <div>
            <Button onClick={() => delete_attachment(name)} bsStyle="danger">
              <Icon name="trash" /> Delete
            </Button>
          </div>
        </div>
      );
    }

    function render_attachments() {
      const v: any[] = [];
      if (cell) {
        const attachments = cell.get("attachments");
        if (attachments) {
          attachments.forEach((_, name) => {
            if (v.length > 0) {
              v.push(<div style={{ marginTop: "7px" }} key={name + "space"} />);
            }
            return v.push(render_attachment(name));
          });
        }
      }
      if (v.length === 0) {
        return (
          <span>
            There are no attachments. To attach images, use Edit &rarr; Insert
            Image.
          </span>
        );
      }
      return v;
    }

    return (
      <Modal show={cell != null} onHide={close}>
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="trash" /> Delete Cell Attachments
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>{render_attachments()}</Modal.Body>

        <Modal.Footer>
          <Button onClick={close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  },
  should_memoize
);
