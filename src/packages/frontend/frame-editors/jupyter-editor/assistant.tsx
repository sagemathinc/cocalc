/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Frame for using the assistant to put code snippets in a Jupyter notebook.
*/

import { Component, Rendered } from "@cocalc/frontend/app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class Assistant extends Component<Props, {}> {
  render(): Rendered {
    return <div>Assistant for putting code snippets in {this.props.path}</div>;
  }
}
