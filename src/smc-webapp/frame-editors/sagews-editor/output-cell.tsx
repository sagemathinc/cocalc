/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Component, Rendered } from "../../app-framework";
import { Map } from "immutable";

interface Props {
  id: string;
  output: Map<string, Map<string, any>>;
}

export class OutputCell extends Component<Props, {}> {
  render(): Rendered {
    return <code>{JSON.stringify(this.props.output.toJS())}</code>;
  }
}
