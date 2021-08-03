/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Embedded PDF viewer.
*/

import { Component, React, Rendered } from "../app-framework";

interface Props {
  src: string;
}

export class PDF extends Component<Props> {
  public render(): Rendered {
    return (
      <embed
        width="100%"
        height="100%"
        src={this.props.src}
        type="application/pdf"
      />
    );
  }
}
