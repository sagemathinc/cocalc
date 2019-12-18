import { redux } from "./app-framework";
import { log } from "./admin/ab-test";

type Test1Action = "Load page" | "Load Jupyter" | "Any edit";

export const log_test1 = (last_action_name: Test1Action): void => {
  if (redux.getStore("account").get("is_anonymous")) {
    log(redux.getStore("account").get("account_id"), "test1", {
      last_action: last_action_name
    });
  } else {
    console.log("Trying to log test1 but account not anon");
  }
};
