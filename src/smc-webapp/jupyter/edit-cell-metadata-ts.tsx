/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Modal for editing cell metadata that are attached to any cell
*/

import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move
const { Icon } = require("../r_misc");
import { Button, Modal } from "react-bootstrap";
import { Map as ImmutableMap } from "immutable";
const { JSONEditor } = require("./json-editor");

interface EditCellMetadataProps {
  actions: any;
  font_size?: number;
  id?: string;
  metadata: ImmutableMap<any, any>;
  cm_options: ImmutableMap<any, any>;
}

export class EditCellMetadata extends Component<EditCellMetadataProps> {
  shouldComponentUpdate(nextProps) {
    return (
      nextProps.metadata !== this.props.metadata ||
      nextProps.font_size !== this.props.font_size ||
      nextProps.cm_options !== this.props.cm_options
    );
  }

  close = () => {
    this.props.actions.setState({ edit_cell_metadata: undefined });
    this.props.actions.focus_unlock();
  };

  render_directions() {
    return (
      <span color="#666">
        Manually edit the JSON below to manipulate the custom metadata for this cell. The JSON is
        automatically saved as long as it is valid.
      </span>
    );
  }

  render_note() {
    return (
      <span color="#888">
        NOTE: The metadata fields "collapsed", "scrolled", "slideshow", and "tags" are not visible
        above, and should only be edited through their own toolbar, the UI or via 'View -> Show
        Notebook as Raw'.
      </span>
    );
  }

  on_change = value => {
    if (this.props.id == null) {
      return;
    }
    return this.props.actions.set_cell_metadata({ id: this.props.id, metadata: value });
  };

  render_editor() {
    return (
      <div
        style={{
          fontSize: this.props.font_size,
          border: "1px solid #ccc",
          margin: "5px",
          borderRadius: "3px"
        }}
      >
        <JSONEditor
          value={this.props.metadata}
          font_size={this.props.font_size}
          on_change={this.on_change}
          cm_options={this.props.cm_options}
          undo={this.props.actions.undo}
          redo={this.props.actions.redo}
        />
      </div>
    );
  }

  render() {
    return (
      <Modal show={this.props.id != null} onHide={this.close}>
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="edit" /> Edit Custom Cell Metadata
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {this.render_directions()}
          {this.render_editor()}
          {this.render_note()}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}
