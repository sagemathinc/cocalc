/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
UGLY.

Support for jupyter classic...  Only load this in the browser, obviously,
and **after** the account store and editor have been loaded.
*/

import { redux } from "../app-framework";

export function init_jupyter_classic_support(
  register_cocalc_jupyter: Function
): void {
  const account_store = redux.getStore("account");
  const account_table = redux.getTable("account");
  let last_jupyter_classic: boolean | undefined = undefined;
  const f = () => {
    const jupyter_classic: boolean = !!account_store.getIn([
      "editor_settings",
      "jupyter_classic",
    ]);
    if (jupyter_classic === last_jupyter_classic) {
      // no change; do nothing
      // NOTE the triple === above, so the above equality is not true
      // if last_jupyter_classic is undefined, since jupyter_classic
      // is either true or false (not undefined!).
      return;
    }
    if (account_table._table.get_state() != "connected") {
      // data not yet valid; do nothing
      // We will call this f again and set things up properly
      // since there will be a change event when the account
      // table loads.
      return;
    }

    last_jupyter_classic = jupyter_classic;
    if (jupyter_classic) {
      require("../editor").switch_to_ipynb_classic();
    } else {
      register_cocalc_jupyter();
    }
  };

  // Do it once **immediately**, so definitely something handles ipynb files.
  f();
  // Then do a quick check any time the account store changes.
  account_store.on("change", f);
}
