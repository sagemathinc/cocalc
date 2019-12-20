import { redux, Store } from "../app-framework";
import { log } from "../admin/ab-test";
import { computeVersion } from "./compute-version";

interface ABTestStoreState {
  is_active: boolean;
  version: "A" | "B";
  name: TESTNAME;
}

type TESTNAME = "sign_up_button";
type SignUpAction = "Load page" | "Clicked Button" | "Signed up";
class SignUpTest {
  public name = "sign_up_button" as const;
  public log = (action: SignUpAction): void => {
    if (action !== "Load page") {
      log_abtest({ action }, this.name);
    } else {
      const now = new Date();
      setTimeout(() => {
        if (redux.getStore("account")?.get("is_anonymous")) {
          log_abtest({ action }, this.name, now);
        }
      }, 5000);
    }
  };
}

const log_abtest = (payload, test_name: TESTNAME, time = new Date()): void => {
  const account = redux.getStore("account");
  const abtest = redux.getStore("abtest");
  if (
    account?.get("is_anonymous") &&
    abtest?.get("is_active") &&
    abtest.get("name") === test_name
  ) {
    log(account.get("account_id"), test_name, payload, time);
  }
  // No-op if test isn't active
};

export const current_test = new SignUpTest();

export const start = (): Store<ABTestStoreState> => {
  const version = computeVersion(redux.getStore("account").get("account_id"));

  return redux.createStore<ABTestStoreState, Store<ABTestStoreState>>(
    "abtest",
    Store,
    {
      name: current_test.name,
      is_active: true,
      version
    }
  );
};
