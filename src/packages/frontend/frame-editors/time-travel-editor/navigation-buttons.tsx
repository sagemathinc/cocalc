/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Navigation Buttons to:

 - first
 - move a step forward
 - move a step back
 - last
*/

import { Button, ButtonGroup } from "react-bootstrap";
import { Component, React, Rendered } from "../../app-framework";
import { Icon } from "../../r_misc";

import { TimeTravelActions } from "./actions";

interface Props {
  id: string;
  actions: TimeTravelActions;

  version0: number;
  version1: number;
  max: number;
}

export class NavigationButtons extends Component<Props> {
  public render(): Rendered {
    const { version0, version1, max } = this.props;
    return (
      <ButtonGroup>
        <Button
          title={"First version"}
          onClick={() => this.props.actions.step(this.props.id, -version0)}
          disabled={version0 != null && version0 <= 0}
        >
          <Icon name="backward" />
        </Button>
        <Button
          title={"Previous version"}
          onClick={() => this.props.actions.step(this.props.id, -1)}
          disabled={version0 != null && version0 <= 0}
        >
          <Icon name="step-backward" />
        </Button>
        <Button
          title={"Next version"}
          onClick={() => this.props.actions.step(this.props.id, 1)}
          disabled={version1 != null && version1 >= max}
        >
          <Icon name="step-forward" />
        </Button>
        <Button
          title={"Most recent version"}
          onClick={() => this.props.actions.step(this.props.id, max - version1)}
          disabled={version1 != null && version1 >= max}
        >
          <Icon name="forward" />
        </Button>
      </ButtonGroup>
    );
  }
}
