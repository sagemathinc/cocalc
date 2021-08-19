/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Frame for showing the classic notebook
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class ClassicalNotebook extends Component<Props, {}> {
  render(): Rendered {
    return (
      <div>
        Classical version of the notebook in an iframe with sync (?) --{" "}
        {this.props.path}
      </div>
    );
  }
}
