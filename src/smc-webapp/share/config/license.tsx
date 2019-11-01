/*
Select the license for a public share.

NOTE: Our approach to state here means that two people can't
simultaneously edit the license and have it be synced properly
between them.  I think this is acceptable, since it is unlikely
for people to do that.
*/

import { React, Component, Rendered } from "../../app-framework";
import { DropdownButton, MenuItem } from "react-bootstrap";

import { LICENSES } from "./licenses";

interface Props {
  license: string;
  set_license: (license: string) => void;
  disabled?: boolean;
}

interface State {
  license: string;
}

export class License extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { license: props.license };
  }

  private select(license: string): void {
    this.setState({ license });
    this.props.set_license(license);
  }

  private displayed_license(): string {
    const x = LICENSES[this.state.license];
    if (x == null) {
      // corrupt data?
      return LICENSES["other"];
    } else {
      return x;
    }
  }

  public render(): Rendered {
    const v: Rendered[] = [];
    for (const key in LICENSES) {
      v.push(
        <MenuItem key={key} eventKey={key} active={key === this.state.license}>
          {LICENSES[key]}
        </MenuItem>
      );
    }
    return (
      <DropdownButton
        bsStyle={"default"}
        title={this.displayed_license()}
        id={"license-menu"}
        onSelect={this.select.bind(this)}
      >
        {v}
      </DropdownButton>
    );
  }
}
