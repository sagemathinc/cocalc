/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Frame for working with a Jupyter notebook as a single document,
like Sage worksheets.
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class SingleDocNotebook extends Component<Props, {}> {
  render(): Rendered {
    return (
      <div>Jupyter notebook as a single document -- {this.props.path}</div>
    );
  }
}
