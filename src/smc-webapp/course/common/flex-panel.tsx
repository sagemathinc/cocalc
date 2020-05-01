/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Rendered, React, Component } from "../../app-framework";

export class FlexPanel extends Component<{ header: any }> {
  render(): Rendered {
    return (
      <div className={"panel panel-default smc-vfill"}>
        <div className="panel-heading">{this.props.header}</div>
        <div className="panel-body smc-vfill">{this.props.children}</div>
      </div>
    );
  }
}
