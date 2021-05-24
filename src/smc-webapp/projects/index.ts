import { init as init_store } from "./store";
import { init as init_actions } from "./actions";
import { init as init_table } from "./table";

export function init() {
  init_store();
  init_actions();
  init_table();
}
