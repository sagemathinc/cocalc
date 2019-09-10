/*
Navigation Buttons to:

 - move a step forward
 - move a step back
*/

import { Button, ButtonToolbar } from "react-bootstrap";
import { Component, React, Rendered } from "../../app-framework";
import { Icon } from "../../r_misc";

import { TimeTravelActions } from "./actions";

interface Props {
  id : string;
  actions: TimeTravelActions;
}

export class NavigationButtons extends Component<Props> {
  public render(): Rendered {
    return (
      <ButtonToolbar>
        <Button onClick={() => this.props.actions.step(this.props.id, -1)}>
          <Icon name="step-backward" />
        </Button>
        <Button onClick={() => this.props.actions.step(this.props.id, 1)}>
          <Icon name="step-forward" />
        </Button>
      </ButtonToolbar>
    );
  }
}
