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

export class OpenFile extends Component<Props> {
  public render(): Rendered {
    // TODO: make the icon be the way for the given type of file
    return (
      <Button
        onClick={() => this.props.actions.open_file()}
        title={"Open the file whose history you are viewing"}
      >
        <Icon name="file-code" /> Open
      </Button>
    );
  }
}
