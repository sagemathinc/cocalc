/*
Navigation Buttons to:

 - move a step forward
 - move a step back
*/

import { Button, ButtonGroup } from "react-bootstrap";
import { Component, React, Rendered } from "../../app-framework";
import { Icon } from "../../r_misc";

import { TimeTravelActions } from "./actions";

interface Props {
  id: string;
  actions: TimeTravelActions;

  version?: number;
  max: number;
}

export class NavigationButtons extends Component<Props> {
  public render(): Rendered {
    const { version, max } = this.props;
    return (
      <ButtonGroup>
        <Button
          title={"First version"}
          onClick={() => this.props.actions.set_version(this.props.id, 0)}
          disabled={version != null && version == 0}
        >
          <Icon name="backward" />
        </Button>
        <Button
          title={"Previous version"}
          onClick={() => this.props.actions.step(this.props.id, -1)}
          disabled={version != null && version <= 0}
        >
          <Icon name="step-backward" />
        </Button>
        <Button
          title={"Next version"}
          onClick={() => this.props.actions.step(this.props.id, 1)}
          disabled={version != null && version >= max - 1}
        >
          <Icon name="step-forward" />
        </Button>
        <Button
          title={"Most recent version"}
          onClick={() => this.props.actions.set_version(this.props.id, max - 1)}
          disabled={version != null && version >= max - 1}
        >
          <Icon name="forward" />
        </Button>
      </ButtonGroup>
    );
  }
}
