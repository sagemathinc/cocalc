/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Frame for editing a code file (e.g., .py, .c, etc.), that would typically be
importing into the main notebook.

Example, when using the docstring browser (say), we could pop up the file that
the code for the function is in here.
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class FileEditor extends Component<Props, {}> {
  render(): Rendered {
    return (
      <div>
        Code Editor for editing any auxiliary file (typically something imported
        into the Jupyter notebook).
      </div>
    );
  }
}
