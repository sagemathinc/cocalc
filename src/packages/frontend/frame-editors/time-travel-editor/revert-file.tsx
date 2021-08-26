/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Rendered, Component } from "../../app-framework";
import { Button } from "react-bootstrap";
import { TimeTravelActions } from "./actions";
import { Icon } from "../../components";

interface Props {
  actions: TimeTravelActions;
  version: Date | undefined;
}

export class RevertFile extends Component<Props> {
  public render(): Rendered {
    return (
      <Button
        title={`Revert file to the displayed version (this makes a new version, so nothing is lost)`}
        onClick={() => {
          if (this.props.version != null)
            this.props.actions.revert(this.props.version);
        }}
        disabled={this.props.version == null}
      >
        <Icon name="undo" /> Revert
      </Button>
    );
  }
}
