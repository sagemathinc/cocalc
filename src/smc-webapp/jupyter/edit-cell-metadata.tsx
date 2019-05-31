/*
Modal for editing cell metadata that are attached to any cell
*/

import { React, Component, Rendered } from "../app-framework";
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

export class EditCellMetadata extends Component<EditCellMetadataProps> {
  public shouldComponentUpdate(nextProps): boolean {
    return (
      nextProps.metadata !== this.props.metadata ||
      nextProps.font_size !== this.props.font_size ||
      nextProps.cm_options !== this.props.cm_options
    );
  }

  private close(): void {
    this.props.actions.setState({ edit_cell_metadata: undefined });
    this.props.actions.focus_unlock();
  }

  private render_directions(): Rendered {
    return (
      <span color="#666">
        Manually edit the JSON below to manipulate the custom metadata for this
        cell. The JSON is automatically saved as long as it is valid.
      </span>
    );
  }

  private render_note(): Rendered {
    return (
      <span color="#888">
        NOTE: The metadata fields "collapsed", "scrolled", "slideshow", and
        "tags" are not visible above, and should only be edited through their
        own toolbar, the UI or via 'View -> Show Notebook as Raw'.
      </span>
    );
  }

  private on_change(value): void {
    if (this.props.id == null) {
      return;
    }
    this.props.actions.set_cell_metadata({
      id: this.props.id,
      metadata: value
    });
  }

  private render_editor(): Rendered {
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
          on_change={this.on_change.bind(this)}
          cm_options={this.props.cm_options}
          undo={this.props.actions.undo}
          redo={this.props.actions.redo}
        />
      </div>
    );
  }

  public render(): Rendered {
    return (
      <Modal show={this.props.id != null} onHide={this.close.bind(this)}>
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
          <Button onClick={this.close.bind(this)}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}
