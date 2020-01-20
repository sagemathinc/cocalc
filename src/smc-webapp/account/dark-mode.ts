import { enable, disable } from "darkreader";

import { AccountStore } from "./store";

let last_dark_mode: boolean | undefined = undefined;
export function init_dark_mode(account_store: AccountStore): void {
  account_store.on("change", () => {
    const dark_mode = account_store.getIn(["other_settings", "dark_mode"]);
    if (dark_mode === last_dark_mode) return;
    last_dark_mode = dark_mode;
    if (dark_mode) {
      enable({
        brightness: 100,
        contrast: 90,
        sepia: 10
      });
    } else {
      disable();
    }
  });
}
