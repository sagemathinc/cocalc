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
import { is_array, trunc } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/project/logger";
const log = getLogger("handle-nbconvert-change");

// nbconvert can output arbitrarily large errors, so we truncate.
// But don't truncate too small!  https://github.com/sagemathinc/cocalc/issues/5878
const MAX_ERROR_LENGTH = 100000;

interface Value {
  state: string;
  args: string[];
}

export default async function handleChange(
  actions: JupyterActions,
  oldVal?: Value,
  newVal?: Value
): Promise<void> {
  log.debug("got a change:", oldVal, newVal);
  if (newVal == null) {
    log.debug("delete nbconvert; no op");
    return;
  }
  if (newVal.state != "start") {
    log.debug(
      `nothing to do -- requesting to change state to '${newVal.state}'.`
    );
    return;
  }
  const { args } = newVal;
  if (!is_array(args)) {
    log.debug("invalid args -- must be an array");
    actions.syncdb.set({
      type: "nbconvert",
      state: "done",
      error: "args must be an array",
    });
    actions.syncdb.commit();
    return;
  }

  log.debug("tell client that we started running");
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
    log.debug(
      "saving file to disk first, since some nbconvert functionality uses that file is on disk."
    );
    await actions.save_ipynb_file();

    log.debug(
      "now actually run nbconvert command (which may or may not actually use upstream nbconvert...)"
    );
    if (actions.jupyter_kernel == null) {
      throw Error("no kernel, so can't run nbconvert");
    }

    await actions.jupyter_kernel.nbconvert(args);
    log.debug("success");
  } catch (err) {
    error = trunc(`${err}`, MAX_ERROR_LENGTH);
    log.debug("error", error);
  }
  actions.syncdb.set({
    type: "nbconvert",
    state: "done",
    error,
    time: new Date().getTime(),
  });
  actions.syncdb.commit();
}
