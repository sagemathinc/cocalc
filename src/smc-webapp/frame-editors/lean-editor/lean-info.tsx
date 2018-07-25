const { Icon } = require("../../r_misc");

import { React, Component, Rendered } from "../../app-framework";

export class LeanInfo extends Component<{}, {}> {
  static displayName = "LeanInfo";

  render(): Rendered {
    return (
      <div>
        Lean Info (<Icon name="gavel" /> Under Construction)
      </div>
    );
  }
}
