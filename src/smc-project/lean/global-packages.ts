/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Initialize the ~/.lean directory if it doesn't already exist.

Right now we "install", i.e., make a pointer to a global copy
of mathlib if there is one.

We might install more later.

NOTE: Rob Lewis suggested this and also tested installing other things
later (e.g., a new mathlib) and says it works: "Okay, I think you're
safe with this setup.   Run leanpkg install /ext/... in/below ~.
If someone creates a Lean project anywhere in ~, the new leanpkg.path
seems to override the global install. This happens whether or not
mathlib is added to the project with leanpkg add. The global install
is unavailable in the project as soon as the project is created."

See https://github.com/sagemathinc/cocalc/issues/4393.
*/

import { callback2 } from "../smc-util/async-utils";
const { execute_code } = require("smc-util-node/misc_node");

export async function init_global_packages(): Promise<void> {
  const command = `[ ! -d "${process.env.HOME}/.lean" ] && [ -d /ext/lean/lean/mathlib ] && leanpkg install /ext/lean/lean/mathlib`;
  // err_on_exit = false because nonzero exit code whenever we don't run the install, which is fine.
  await callback2(execute_code, { command, bash: true, err_on_exit: false });
}
