/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import { React, Component, Rendered } from "../app-framework";

export class CoCalcLogo extends Component<{ base_path: string }> {
  public render(): Rendered {
    return (
      <img
        style={{ height: "21px", width: "21px" }}
        src={join(this.props.base_path, "share/cocalc-icon.svg")}
      />
    );
  }
}
