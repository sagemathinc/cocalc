/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Frame that displays the log for a Jupyter Notebook
*/

import { Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class ObjectBrowser extends Component<Props, {}> {
  render(): Rendered {
    return (
      <div>Jupyter Notebook Object Browser View for {this.props.path}</div>
    );
  }
}
