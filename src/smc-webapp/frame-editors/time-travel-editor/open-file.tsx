/* Open file that we are viewing the history of. */

import { Rendered, Component, React } from "../../app-framework";
import { Button } from "react-bootstrap";
import { TimeTravelActions } from "./actions";

interface Props {
  actions: TimeTravelActions;
}

export class OpenFile extends Component<Props> {
  public render(): Rendered {
    return (
      <Button onClick={() => this.props.actions.open_file()}>
        Open File
      </Button>
    );
  }
}
