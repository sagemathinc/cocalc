import { Button } from "react-bootstrap";
import { Icon } from "../../r_misc/icon";
import { React, Component, Rendered } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { JupyterActions } from "../actions";

interface MoreOutputProps {
  message: Map<string, any>;
  id: string;
  actions?: JupyterActions; // if not set, then can't get more output
}

export class MoreOutput extends Component<MoreOutputProps> {
  shouldComponentUpdate(nextProps: MoreOutputProps) : boolean {
    return (
      nextProps.message !== this.props.message || nextProps.id != this.props.id
    );
  }

  show_more_output = (): void => {
    this.props.actions != null
      ? this.props.actions.fetch_more_output(this.props.id)
      : undefined;
  };

  render(): Rendered {
    if (this.props.actions == null || this.props.message.get("expired")) {
      return (
        <Button bsStyle="info" disabled>
          <Icon name="eye-slash" /> Additional output not available
        </Button>
      );
    } else {
      return (
        <Button onClick={this.show_more_output} bsStyle="info">
          <Icon name="eye" /> Fetch additional output...
        </Button>
      );
    }
  }
}
