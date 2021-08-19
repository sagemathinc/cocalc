/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Component, Rendered } from "../../app-framework";

interface Props {
  id: string;
}

export class HiddenInputCell extends Component<Props, {}> {
  render(): Rendered {
    return <div>hidden</div>;
  }
}
