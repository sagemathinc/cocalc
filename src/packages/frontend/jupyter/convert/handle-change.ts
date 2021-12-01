/*
Client sets this:
    {type:'nbconvert', args:[...], state:'start'}

Then:
 1. All clients show status bar that export is happening.
 2. Commands to export are disabled during export.
 3. Unless timeout exceeded.

The code in this file implements what the project does.

- Project sees export entry in table.  If currently exporting, does nothing.
If not exporting, starts exporting and sets:

     {type:'nbconvert', args:[...], state:'run', start:[time in ms]}

- When done, project sets

     {type:'nbconvert', args:[...], state:'done'}

- If error, project stores the error in the key:value store and sets:

     {type:'nbconvert', args:[...], state:'done', error:'message' or {key:'xlkjdf'}}
*/

import type { JupyterActions } from "../project-actions";
import { is_array } from "@cocalc/util/misc";

interface Value {
  state: string;
  args: string[];
}

export default async function handleChange(
  actions: JupyterActions,
  oldVal?: Value,
  newVal?: Value
): Promise<void> {
  const dbg = actions.dbg("run_nbconvert");
  dbg(oldVal, newVal);
  if (newVal == null) {
    dbg("delete nbconvert; no op");
    return;
  }
  if (newVal.state != "start") {
    dbg(`nothing to do -- requesting to change state to '${newVal.state}'.`);
    return;
  }
  const { args } = newVal;
  if (!is_array(args)) {
    dbg("invalid args -- must be an array");
    actions.syncdb.set({
      type: "nbconvert",
      state: "done",
      error: "args must be an array",
    });
    actions.syncdb.commit();
    return;
  }

  dbg("tell client that we started running");
  let error: any = null;
  actions.syncdb.set({
    type: "nbconvert",
    state: "run",
    start: new Date().getTime(),
    error,
  });
  actions.syncdb.commit();
  actions.ensure_backend_kernel_setup();

  try {
    dbg(
      "saving file to disk first, since some nbconvert functionality uses that file is on disk."
    );
    await actions.save_ipynb_file();

    dbg(
      "now actually run nbconvert command (which may or may not actually use upstream nbconvert...)"
    );
    if (actions.jupyter_kernel == null) {
      throw Error("no kernel, so can't run nbconvert");
    }

    await actions.jupyter_kernel.nbconvert(args);
  } catch (err) {
    err = `${err}`;
    if (err.length >= 200) {
      // try to save in key:value store since it is *huge*.
      if (actions.jupyter_kernel?.store) {
        actions.jupyter_kernel.store.set("nbconvert_error", err);
      }
      error = { key: "nbconvert_error" };
    } else {
      error = err;
    }
  }
  actions.syncdb.set({
    type: "nbconvert",
    state: "done",
    error,
    time: new Date().getTime(),
  });
  actions.syncdb.commit();
}
