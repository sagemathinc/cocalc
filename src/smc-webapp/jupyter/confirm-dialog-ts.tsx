/*
Confirmation dialog, for explicitly confirming dangerous actions.
*/

import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move
import { Map as ImmutableMap } from "immutable";

const { Icon, Markdown } = require("../r_misc"); // TODO: import types
const { Button, Modal } = require("react-bootstrap"); // TODO: import types

interface ConfirmDialogProps {
  actions: any; // TODO: types
  confirm_dialog: ImmutableMap<any, any>;
}

export class ConfirmDialog extends Component<ConfirmDialogProps> {
  close = () => {
    this.props.actions.close_confirm_dialog();
    this.props.actions.focus(true);
  };
  render_button(choice: any) {
    // TODO: types
    return (
      <Button
        key={choice.get("title")}
        bsStyle={choice.get("style")}
        autoFocus={choice.get("default")}
        onClick={() =>
          this.props.actions.close_confirm_dialog(choice.get("title"))
        }
      >
        {choice.get("title")}
      </Button>
    );
  }
  render_buttons() {
    if (this.props.confirm_dialog) {
      return this.props.confirm_dialog
        .get("choices", [])
        .map(choice => this.render_button(choice));
    }
    return [];
  }
  render_title_icon() {
    const icon =
      this.props.confirm_dialog != null
        ? this.props.confirm_dialog.get("icon")
        : undefined;
    if (icon != null) {
      return <Icon name={icon} />;
    }
    return undefined;
  }
  render() {
    // Show if the confirm_dailog prop is set, but the choice field is not set.
    // TODO: better guard against confirm_dialog == null?
    return (
      <Modal
        show={
          this.props.confirm_dialog != null &&
          this.props.confirm_dialog.get("choice") == null
        }
        onHide={this.close}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {this.render_title_icon()}{" "}
            {this.props.confirm_dialog != null
              ? this.props.confirm_dialog.get("title")
              : undefined}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Markdown
            value={
              this.props.confirm_dialog != null
                ? this.props.confirm_dialog.get("body")
                : undefined
            }
          />
        </Modal.Body>

        <Modal.Footer>{this.render_buttons()}</Modal.Footer>
      </Modal>
    );
  }
}
