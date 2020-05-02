/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Component } from "../app-framework";

import { Icon } from "../r_misc";

// TODO: maybe clicking to reveal.
// This is just an mvp. See https://github.com/sagemathinc/cocalc/issues/3835

interface Props {
  title: string;
}

export class CellHiddenPart extends Component<Props, {}> {
  render() {
    return (
      <div
        style={{ color: "#aaa", fontSize: "14pt", paddingLeft: "15px" }}
        title={this.props.title}
      >
        <Icon name={"ellipsis-h"} />
      </div>
    );
  }
}
