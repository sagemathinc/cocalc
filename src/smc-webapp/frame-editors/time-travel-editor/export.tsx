/* Export history to json.

- This is really just some minimal data *about* the history for now.
*/

import { Rendered, Component, React } from "../../app-framework";
import { Button } from "react-bootstrap";
import { TimeTravelActions } from "./actions";
import { Icon } from "../../r_misc";

interface Props {
  actions: TimeTravelActions;
}

export class Export extends Component<Props> {
  public render(): Rendered {
    return (
      <Button
        onClick={() => this.props.actions.export()}
        title="Export information about edit history to a JSON file"
      >
        <Icon name={"file-export"} /> Export
      </Button>
    );
  }
}
