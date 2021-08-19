/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Frame for configuring the kernel for a Jupyter Notebook

- the kernel selection page that you get right now when clicking on the kernel in the upper right
- ability to edit rate limits
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class KernelConfiguration extends Component<Props, {}> {
  render(): Rendered {
    return <div>Configure Jupyter Kernel For {this.props.path}</div>;
  }
}
