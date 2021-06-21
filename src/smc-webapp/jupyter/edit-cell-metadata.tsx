/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Modal for editing cell metadata that are attached to any cell
*/

import { React, Rendered } from "../app-framework";
import { Icon } from "../r_misc/icon";
import { Button, Modal } from "react-bootstrap";
import { Map as ImmutableMap } from "immutable";
import { JSONEditor } from "./json-editor";
import { JupyterActions } from "./browser-actions";

interface EditCellMetadataProps {
  actions: JupyterActions;
  id?: string;
  font_size?: number;
  metadata: ImmutableMap<string, any>;
  cm_options: ImmutableMap<string, any>;
}

function should_memoize(prev, next) {
  return (
    next.metadata === prev.metadata &&
    next.font_size === prev.font_size &&
    next.cm_options === prev.cm_options
  );
}

export const EditCellMetadata: React.FC<EditCellMetadataProps> = React.memo(
  (props: EditCellMetadataProps) => {
    const { actions, id, font_size, metadata, cm_options } = props;

    function close(): void {
      actions.setState({ edit_cell_metadata: undefined });
      actions.focus_unlock();
    }

    function render_directions(): Rendered {
      return (
        <span color="#666">
          Manually edit the JSON below to manipulate the custom metadata for
          this cell. The JSON is automatically saved as long as it is valid.
        </span>
      );
    }

    function render_note(): Rendered {
      return (
        <span color="#888">
          NOTE: The metadata fields "collapsed", "scrolled", "slideshow", and
          "tags" are not visible above, and should only be edited through their
          own toolbar, the UI or via 'View &rarr; Show Notebook as Raw'.
        </span>
      );
    }

    function on_change(value): void {
      if (id == null) {
        return;
      }
      actions.set_cell_metadata({
        id: id,
        metadata: value,
      });
    }

    function render_editor(): Rendered {
      return (
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
            on_change={on_change}
            cm_options={cm_options}
            undo={actions.undo}
            redo={actions.redo}
          />
        </div>
      );
    }

    return (
      <Modal show={id != null} onHide={close}>
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="edit" /> Edit Custom Cell Metadata
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {render_directions()}
          {render_editor()}
          {render_note()}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  },
  should_memoize
);
