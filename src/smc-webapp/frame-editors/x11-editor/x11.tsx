/*
X11 Window frame.
*/

import { React, Component, Rendered } from "../../app-framework";

export class X11 extends Component<{}, {}> {
  static displayName = "X11";

  render(): Rendered {
    return <div className="smc-vfill" id="x11" />;
  }
}
