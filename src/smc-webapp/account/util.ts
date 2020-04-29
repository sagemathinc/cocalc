import { redux } from "../app-framework";
import { alert_message } from "../alerts";

export function set_account_table(obj: object): void {
  redux.getTable("account").set(obj);
}

export function ugly_error(err: any): void {
  if (typeof err != "string") {
    err = JSON.stringify(err);
  }
  alert_message({ type: "error", message: `Settings error -- ${err}` });
}
