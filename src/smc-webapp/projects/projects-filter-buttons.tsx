import { React, Component, redux } from "../app-framework";
const { Button, ButtonGroup } = require("react-bootstrap");
const { Icon } = require("../r_misc");

interface Props {
  hidden: boolean;
  deleted: boolean;
  show_hidden_button?: boolean;
  show_deleted_button?: boolean;
}

export class ProjectsFilterButtons extends Component<Props> {
  static defaultProps = {
    hidden: false,
    deleted: false,
    show_hidden_button: false,
    show_deleted_button: false
  };

  render_deleted_button() {
    const style = this.props.deleted ? "warning" : "default";
    if (this.props.show_deleted_button) {
      return (
        <Button
          onClick={() =>
            redux
              .getActions("projects")
              .display_deleted_projects(!this.props.deleted)
          }
          bsStyle={style}
        >
          <Icon
            name={this.props.deleted ? "check-square-o" : "square-o"}
            fixedWidth
          />{" "}
          Deleted
        </Button>
      );
    } else {
      return null;
    }
  }

  render_hidden_button() {
    const style = this.props.hidden ? "warning" : "default";
    if (this.props.show_hidden_button) {
      return (
        <Button
          onClick={() =>
            redux
              .getActions("projects")
              .display_hidden_projects(!this.props.hidden)
          }
          bsStyle={style}
        >
          <Icon
            name={this.props.hidden ? "check-square-o" : "square-o"}
            fixedWidth
          />{" "}
          Hidden
        </Button>
      );
    }
  }

  render() {
    return (
      <ButtonGroup>
        {this.render_deleted_button()}
        {this.render_hidden_button()}
      </ButtonGroup>
    );
  }
}
