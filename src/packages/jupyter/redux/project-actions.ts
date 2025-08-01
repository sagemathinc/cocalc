/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
project-actions: additional actions that are only available in the
backend/project, which "manages" everything.

This code should not *explicitly* require anything that is only
available in the project or requires node to run, so that we can
fully unit test it via mocking of components.

NOTE: this is also now the actions used by remote compute servers as well.
*/

import { JupyterActions as JupyterActions0 } from "@cocalc/jupyter/redux/actions";
import { kernel as createJupyterKernel } from "@cocalc/jupyter/kernel";

export class JupyterActions extends JupyterActions0 {
  public blobs = {
    set: (_k, _v) => {},
    get: (_k): any => {},
  };
  save_ipynb_file = async (_opts?) => {};
  capture_output_message = (_opts) => {};
  process_comm_message_from_kernel = (_mesg) => {};

  initKernel = () => {
    if (this.jupyter_kernel != null) {
      return;
    }
    const kernel = this.store.get("kernel");
    console.log("initKernel", { kernel, path: this.path });
    // No kernel wrapper object setup at all. Make one.
    this.jupyter_kernel = createJupyterKernel({
      name: kernel,
      path: this.path,
      actions: this,
    });
  };

  // not actually async...
  signal = async (signal = "SIGINT"): Promise<void> => {
    this.jupyter_kernel?.signal(signal);
  };
}
