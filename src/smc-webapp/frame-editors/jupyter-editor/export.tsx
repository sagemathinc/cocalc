/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Frame for exporting notebook to some other format (mainly using nbconvert).
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class Export extends Component<Props, {}> {
  render(): Rendered {
    return (
      <div>
        Exporting notebook to other formats (nbconvert) -- {this.props.path}
      </div>
    );
  }
}
