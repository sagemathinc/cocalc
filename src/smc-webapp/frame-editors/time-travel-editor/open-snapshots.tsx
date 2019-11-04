/* Open ~/.snapshots directory.

- We call this Backups
- We will rewite this component with something better that gives
  just links to the info from backups about *this* file.
*/

import { Rendered, Component, React } from "../../app-framework";
import { Button } from "react-bootstrap";
import { TimeTravelActions } from "./actions";
import { Icon } from "../../r_misc";

interface Props {
  actions: TimeTravelActions;
}

export class OpenSnapshots extends Component<Props> {
  public render(): Rendered {
    return (
      <Button
        onClick={() => this.props.actions.open_snapshots()}
        title={
          "Open the filesystem snapshots of this project, which may also be helpful in recovering past versions."
        }
      >
        <Icon name={"life-ring"} /> Backups
      </Button>
    );
  }
}
