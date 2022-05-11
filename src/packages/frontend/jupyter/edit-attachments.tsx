/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Modal for editing attachments that are attached to a markdown cell
*/

import { Icon } from "../components";
import { Button, Modal } from "antd";
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
  cell?: ImmutableMap<string, any>;
}

export function EditAttachments({ actions, cell }: EditAttachmentsProps) {
  function close() {
    actions.setState({ edit_attachments: undefined });
    actions.focus(true);
  }

  function renderAttachments() {
    const v: any[] = [];
    if (cell) {
      const attachments = cell.get("attachments");
      if (attachments) {
        attachments.forEach((_, name) => {
          if (v.length > 0) {
            v.push(<div style={{ marginTop: "7px" }} key={name + "space"} />);
          }
          return v.push(
            <div key={name} style={{ ...ROW_STYLE, width: "100%" }}>
              <div style={{ flex: 1 }}>{name}</div>
              <div>
                <Button
                  onClick={() => {
                    actions.delete_attachment_from_cell(cell.get("id"), name);
                  }}
                  danger
                >
                  <Icon name="trash" /> Delete
                </Button>
              </div>
            </div>
          );
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
    <Modal
      visible={cell != null}
      onCancel={close}
      onOk={close}
      title={
        <>
          <Icon name="trash" /> Delete Cell Attachments
        </>
      }
    >
      {renderAttachments()}
    </Modal>
  );
}
