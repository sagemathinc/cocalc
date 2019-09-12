/* Open file that we are viewing the history of. */

import { Rendered, Component, React } from "../../app-framework";
import { Button } from "react-bootstrap";
import { TimeTravelActions } from "./actions";

interface Props {
  actions: TimeTravelActions;
  version: Date | undefined;
}

export class RevertFile extends Component<Props> {
  public render(): Rendered {
    return (
      <Button
        title={`Revert file to what it was at ${this.props.version}.  Reverting makes a new version, so nothing is lost.`}
        onClick={() => {
          if (this.props.version != null)
            this.props.actions.revert(this.props.version);
        }}
        disabled={this.props.version == null}
      >
        Revert file to this
      </Button>
    );
  }
}
