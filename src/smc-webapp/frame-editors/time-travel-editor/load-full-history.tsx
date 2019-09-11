/* Show a revision version, both with a number and the time. */

import { Rendered, Component, React } from "../../app-framework";
import { Button } from "react-bootstrap";
import { TimeTravelActions } from "./actions";

interface Props {
  actions: TimeTravelActions;
}

export class LoadFullHistory extends Component<Props> {
  public render(): Rendered {
    return (
      <Button onClick={() => this.props.actions.load_full_history()}>
        Load Full History
      </Button>
    );
  }
}
