/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Rendered, Component, React } from "../../app-framework";
import { Button } from "react-bootstrap";
import { TimeTravelActions } from "./actions";
import { Icon } from "../../r_misc";

interface Props {
  actions: TimeTravelActions;
}

export class LoadFullHistory extends Component<Props> {
  public render(): Rendered {
    return (
      <Button
        onClick={() => this.props.actions.load_full_history()}
        title={"Load the complete edit history for this file."}
      >
        <Icon name="floppy-o" /> Load All
      </Button>
    );
  }
}
