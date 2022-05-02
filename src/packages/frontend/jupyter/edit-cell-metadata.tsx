/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Modal for editing cell metadata that are attached to any cell
*/

import { Icon } from "../components/icon";
import { Button, Modal } from "antd";
import { Map as ImmutableMap } from "immutable";
import { JSONEditor } from "./json-editor";
import { JupyterActions } from "./browser-actions";

interface EditCellMetadataProps {
  actions: JupyterActions;
  id: string;
  font_size?: number;
  metadata: ImmutableMap<string, any>;
  cm_options: ImmutableMap<string, any>;
}

export function EditCellMetadata({
  actions,
  id,
  font_size,
  metadata,
  cm_options,
}: EditCellMetadataProps) {
  return (
    <Modal
      closable={false}
      width={700}
      visible={id != null}
      title={
        <>
          <Icon name="edit" /> Edit Custom Cell Metadata
        </>
      }
      footer={
        <Button
          type="primary"
          onClick={() => {
            actions.setState({ edit_cell_metadata: undefined });
            actions.focus_unlock();
          }}
        >
          Done
        </Button>
      }
    >
      <span color="#666">
        Manually edit the JSON below to manipulate the custom metadata for this
        cell. The JSON is saved as long as it is valid; otherwise, you'll see a
        big red error message.
      </span>
      <div
        style={{
          fontSize: font_size,
          border: "1px solid #ccc",
          margin: "5px",
          borderRadius: "3px",
        }}
      >
        <JSONEditor
          value={metadata}
          font_size={font_size}
          on_change={(metadata) => {
            actions.set_cell_metadata({
              id,
              metadata,
            });
          }}
          cm_options={cm_options}
          undo={actions.undo}
          redo={actions.redo}
        />
      </div>
      <span color="#888">
        NOTE: The metadata fields "collapsed", "scrolled", "slideshow", and
        "tags" are not visible above, and should only be edited through their
        own toolbar, the UI or via 'View &rarr; Show Notebook as Raw'.
      </span>
    </Modal>
  );
}
