/*
Confirmation dialog, for explicitly confirming dangerous actions.
*/

import { React, Component, Rendered } from "../app-framework";
import { Map } from "immutable";

const { Icon, Markdown } = require("../r_misc"); // TODO: import types
const { Button, Modal } = require("react-bootstrap"); // TODO: import types

import { JupyterActions } from "./browser-actions";

// This defines what data should be put in the confirm_dialog prop,
// which gets passed in as immutable data below.  Use it externally
// in whatever function is going to set that data in the first place.
export interface ConfirmDialogChoice {
  title: string;
  style?: string; // button styles -- https://react-bootstrap.github.io/components/buttons/
  default?: boolean;
}

export interface ConfirmDialogOptions {
  title: string;
  body: string;
  choices: ConfirmDialogChoice[];
  icon?: string;
}

interface ConfirmDialogProps {
  actions: JupyterActions;
  confirm_dialog: Map<string, any>;
}

export class ConfirmDialog extends Component<ConfirmDialogProps> {
  close(): void {
    this.props.actions.close_confirm_dialog();
    this.props.actions.focus(true);
  }

  render_button(choice: ConfirmDialogChoice): Rendered {
    return (
      <Button
        key={choice.title}
        bsStyle={choice.style}
        autoFocus={choice.default}
        onClick={() => this.props.actions.close_confirm_dialog(choice.title)}
      >
        {choice.title}
      </Button>
    );
  }

  render_buttons(): Rendered[] {
    const choices = this.props.confirm_dialog.get("choices");
    const buttons: Rendered[] = [];
    if (choices != null) {
      choices.forEach(choice =>
        buttons.push(this.render_button(choice.toJS()))
      );
    }
    return buttons;
  }

  render_title_icon(): Rendered {
    const icon = this.props.confirm_dialog.get("icon");
    if (icon == null) return;
    return <Icon name={icon} />;
  }

  render(): Rendered {
    // Show only if the choice field is not set (which happens when user
    // makes a choice).
    return (
      <Modal
        show={this.props.confirm_dialog.get("choice") == null}
        onHide={() => this.close()}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {this.render_title_icon()} {this.props.confirm_dialog.get("title")}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Markdown value={this.props.confirm_dialog.get("body")} />
        </Modal.Body>

        <Modal.Footer>{this.render_buttons()}</Modal.Footer>
      </Modal>
    );
  }
}
