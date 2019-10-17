const { Button } = require("react-bootstrap");

const { Icon, VisibleMDLG } = require("smc-webapp/r_misc");

import { React, Rendered, Component } from "../../app-framework";

import { UncommittedChanges } from "../../r_misc";

interface Props {
  has_unsaved_changes?: boolean;
  has_uncommitted_changes?: boolean;
  read_only?: boolean;
  is_public?: boolean;
  is_saving?: boolean;
  no_labels?: boolean;
  size?: string;
  onClick?: Function;
}

export class SaveButton extends Component<Props, {}> {
  render(): Rendered {
    const disabled: boolean =
      !this.props.has_unsaved_changes ||
      !!this.props.read_only ||
      !!this.props.is_public;

    let label: string = "";
    if (!this.props.no_labels) {
      if (this.props.is_public) {
        label = "Public";
      } else if (this.props.read_only) {
        label = "Readonly";
      } else {
        label = "Save";
      }
    } else {
      label = "";
    }

    let icon: string;
    if (this.props.is_saving) {
      icon = "arrow-circle-o-left";
    } else {
      icon = "save";
    }

    // The funny style in the icon below is because the width changes
    // slightly depending on which icon we are showing.
    return (
      <Button
        title={"Save file to disk"}
        bsStyle={"success"}
        bsSize={this.props.size}
        disabled={disabled}
        onClick={this.props.onClick}
      >
        <Icon name={icon} style={{ width: "15px", display: "inline-block" }} />{" "}
        <VisibleMDLG>{label}</VisibleMDLG>
        <UncommittedChanges
          has_uncommitted_changes={this.props.has_uncommitted_changes}
        />
      </Button>
    );
  }
}
