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
import { getLogger } from "@cocalc/backend/logger";
import { uuid } from "@cocalc/util/misc";

const logger = getLogger("jupyter:project-actions");

export class JupyterActions extends JupyterActions0 {
  protected init2(): void {
    this.initIpywidgetsSupport();
  }

  save_ipynb_file = async (_opts?) => {
    throw Error("save ipynb file on backend no longer implemented");
  };

  ensureKernelIsReady = () => {
    if (this.jupyter_kernel != null) {
      if (this.jupyter_kernel.isClosed()) {
        delete this.jupyter_kernel;
      } else {
        return;
      }
    }
    const kernel = this.store.get("kernel");
    logger.debug("initKernel", { kernel, path: this.path });
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

  ///////////////////////////
  // Jupyter Widgets Support
  ///////////////////////////
  private initIpywidgetsSupport = () => {
    if (this.syncdb.ipywidgets_state == null) {
      logger.debug(
        "initIpywidgetsSupport: NOT WORKING -- ipywidgets_state not defined",
      );
      throw Error("syncdb's ipywidgets_state must be defined!");
    }
    this.syncdb.ipywidgets_state.on(
      "change",
      this.handle_ipywidgets_state_change,
    );
    logger.debug("initIpywidgetsSupport: initialized");
  };

  capture_output_message = (mesg: any): boolean => {
    if (this.syncdb.ipywidgets_state == null) {
      throw Error("syncdb's ipywidgets_state must be defined!");
    }
    return this.syncdb.ipywidgets_state.capture_output_message(mesg);
  };

  process_comm_message_from_kernel = async (mesg: any): Promise<void> => {
    logger.debug("process_comm_message_from_kernel", mesg.header);
    if (this.syncdb.ipywidgets_state == null) {
      throw Error("syncdb's ipywidgets_state must be defined!");
    }
    await this.syncdb.ipywidgets_state.process_comm_message_from_kernel(mesg);
  };

  // handle_ipywidgets_state_change is called when the project ipywidgets_state
  // object changes, e.g., in response to a user moving a slider in the browser.
  // It crafts a comm message that is sent to the running Jupyter kernel telling
  // it about this change by calling sendCommMessageToKernel.
  private handle_ipywidgets_state_change = (keys): void => {
    if (this.isClosed()) {
      return;
    }
    logger.debug("handle_ipywidgets_state_change", keys);
    if (this.jupyter_kernel == null) {
      logger.debug(
        "handle_ipywidgets_state_change: no kernel, so ignoring changes to ipywidgets",
      );
      return;
    }
    if (this.syncdb.ipywidgets_state == null) {
      throw Error("syncdb's ipywidgets_state must be defined!");
    }
    for (const key of keys) {
      const [, model_id, type] = JSON.parse(key);
      let data: any;
      if (type === "value") {
        const state = this.syncdb.ipywidgets_state.get_model_value(model_id);
        // Saving the buffers on change is critical since otherwise this breaks:
        //  https://ipywidgets.readthedocs.io/en/latest/examples/Widget%20List.html#file-upload
        // Note that stupidly the buffer (e.g., image upload) gets sent to the kernel twice.
        // But it does work robustly, and the kernel and nodejs server processes next to each
        // other so this isn't so bad.
        const { buffer_paths, buffers } =
          this.syncdb.ipywidgets_state.getKnownBuffers(model_id);
        data = { method: "update", state, buffer_paths };
        this.jupyter_kernel.sendCommMessageToKernel({
          msg_id: uuid(),
          target_name: "jupyter.widget",
          comm_id: model_id,
          data,
          buffers,
        });
      } else if (type === "buffers") {
        // TODO: we MIGHT need implement this... but MAYBE NOT.  An example where this seems like it might be
        // required is by the file upload widget, but actually that just uses the value type above, since
        // we explicitly fill in the widgets there; also there is an explicit comm upload message that
        // the widget sends out that updates the buffer, and in sendCommMessageToKernel in jupyter/kernel/kernel.ts
        // when processing that message, we saves those buffers and make sure they are set in the
        // value case above (otherwise they would get removed).
        //    https://ipywidgets.readthedocs.io/en/latest/examples/Widget%20List.html#file-upload
        // which creates a buffer from the content of the file, then sends it to the backend,
        // which sees a change and has to write that buffer to the kernel (here) so that
        // the running python process can actually do something with the file contents (e.g.,
        // process data, save file to disk, etc).
        // We need to be careful though to not send buffers to the kernel that the kernel sent us,
        // since that would be a waste.
      } else if (type === "state") {
        // TODO: currently ignoring this, since it seems chatty and pointless,
        // and could lead to race conditions probably with multiple users, etc.
        // It happens right when the widget is created.
        /*
        const state = this.syncdb.ipywidgets_state.getModelSerializedState(model_id);
        data = { method: "update", state };
        this.jupyter_kernel.sendCommMessageToKernel(
          misc.uuid(),
          model_id,
          data
        );
        */
      } else {
        const m = `Jupyter: unknown type '${type}'`;
        console.warn(m);
        logger.debug("WARNING: ", m);
      }
    }
  };
}
