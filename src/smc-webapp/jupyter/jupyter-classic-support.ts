/*
UGLY.

Support for jupyter classic...  Only load this in the browser, obviously,
and **after** the account store.
*/

import { redux } from "../app-framework";

export function init_jupyter_classic_support(
  register_cocalc_jupyter: Function
): void {
  const account_store = redux.getStore("account");
  const account_table = redux.getTable("account");
  let last_jupyter_classic: boolean | undefined = undefined;

  account_store.on("change", () => {
    const jupyter_classic = account_store.getIn([
      "editor_settings",
      "jupyter_classic",
    ]);
    if (jupyter_classic === last_jupyter_classic) return; // no change; do nothing
    if (account_table._table.get_state() != "connected") return; // data not yet valid; do nothing

    last_jupyter_classic = jupyter_classic;
    if (jupyter_classic) {
      require("../editor").switch_to_ipynb_classic();
    } else {
      register_cocalc_jupyter();
    }
  });
}
